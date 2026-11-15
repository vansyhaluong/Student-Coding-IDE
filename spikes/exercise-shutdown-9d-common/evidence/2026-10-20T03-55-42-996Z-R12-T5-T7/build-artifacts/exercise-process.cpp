// Main-only Node-API binding. No Electron/preload/renderer API is exposed here.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <node_api.h>
#include <atomic>
#include <memory>
#include <string>
#include <thread>
#include <vector>
#include <stdexcept>

static int spikeFault = 0; // SPIKE ONLY: 1 Job, 2 spawn, 3 terminate, 4 release
static void check(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
static void napiCheck(napi_status s) { check(s == napi_ok, "Native binding operation failed"); }
struct Handle {
  HANDLE value = nullptr;
  ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
  void close() { if (value) { check(CloseHandle(value) != 0, "Native handle release failed"); value = nullptr; } }
};
struct Session {
  Handle memoryPort; SIZE_T configuredQuota = 0;
  Handle job, root, out, err, inputWrite;
  bool csharp = false;
  unsigned pendingWrites = 0;
  DWORD pid = 0;
  napi_threadsafe_function events = nullptr;
  napi_ref callback = nullptr;
  napi_async_cleanup_hook_handle cleanup = nullptr;
  std::thread stdoutThread, stderrThread, rootThread;
  std::atomic<bool> teardown{false};
  bool drained = false, released = false, abandoned = false;
};
static void limitsSetup(Session*);
struct Event { std::string type; std::string data; DWORD code = 0; };
static DWORD active(Session* s) {
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info{};
  check(s->job.value && QueryInformationJobObject(s->job.value, JobObjectBasicAccountingInformation,
    &info, sizeof(info), nullptr), "Job accounting failed");
  return info.ActiveProcesses;
}
static napi_value text(napi_env env, const std::string& value) {
  napi_value result; napiCheck(napi_create_string_utf8(env, value.data(), value.size(), &result)); return result;
}
static void deliver(napi_env env, napi_value callback, Event* event) {
  napi_value object, ignored, receiver;
  napiCheck(napi_create_object(env, &object));
  napiCheck(napi_set_named_property(env, object, "type", text(env, event->type)));
  if (event->type == "stdout" || event->type == "stderr") {
    napi_value bytes;
    napiCheck(napi_create_buffer_copy(env, event->data.size(), event->data.data(), nullptr, &bytes));
    napiCheck(napi_set_named_property(env, object, "data", bytes));
  }
  if (event->type == "exit") {
    napi_value code; napiCheck(napi_create_uint32(env, event->code, &code));
    napiCheck(napi_set_named_property(env, object, "exitCode", code));
  }
  napiCheck(napi_get_undefined(env, &receiver));
  // JS adapter owns observer exception handling; never unwind C++ through Node.
  napi_call_function(env, receiver, callback, 1, &object, &ignored);
}
static void callEvent(napi_env env, napi_value callback, void*, void* data) {
  std::unique_ptr<Event> event(static_cast<Event*>(data));
  if (env && callback) { try { deliver(env, callback, event.get()); } catch (...) {} }
}
static void send(Session* s, Event event) {
  auto data = std::make_unique<Event>(std::move(event));
  if (napi_call_threadsafe_function(s->events, data.get(), napi_tsfn_blocking) == napi_ok) data.release();
}
static void readPipe(Session* s, HANDLE pipe, const char* stream) {
  char bytes[8192]; DWORD count;
  for (;;) {
    if (!ReadFile(pipe, bytes, sizeof(bytes), &count, nullptr)) {
      if (GetLastError() != ERROR_BROKEN_PIPE && !s->teardown) send(s, {"error", "", 0});
      break;
    }
    if (!count) break;
    send(s, {stream, std::string(bytes, count), 0});
  }
  send(s, {std::string(stream) + "-eof", "", 0});
  napi_release_threadsafe_function(s->events, napi_tsfn_release);
}
static void join(Session* s) {
  if (s->stdoutThread.joinable()) s->stdoutThread.join();
  if (s->stderrThread.joinable()) s->stderrThread.join();
  if (s->rootThread.joinable()) s->rootThread.join();
}
static void release(Session* s) {
  if (s->released) return;
  check(spikeFault != 4, "Injected release failure");
  check(s->pendingWrites == 0 && s->drained && active(s) == 0 && WaitForSingleObject(s->root.value, 0) == WAIT_OBJECT_0,
    "Native process is not ready for release");
  s->inputWrite.close(); s->out.close(); s->err.close(); s->root.close(); s->job.close(); s->memoryPort.close(); s->released = true;
}
static void finalizeEvents(napi_env env, void* data, void*) {
  auto s = static_cast<Session*>(data);
  join(s); // All producers released TSFN; none can be blocked in pipe IO here.
  s->drained = true;
  if (!s->teardown) {
    try {
      napi_value callback; napiCheck(napi_get_reference_value(env, s->callback, &callback));
      Event event{"settled", "", 0}; deliver(env, callback, &event);
    } catch (...) {}
  }
  napi_delete_reference(env, s->callback); s->callback = nullptr;
  if (s->teardown) {
    // Teardown is only a last-resort native safety hook, not app quit orchestration.
    try { release(s); } catch (...) {}
    if (s->cleanup) { napi_remove_async_cleanup_hook(s->cleanup); s->cleanup = nullptr; }
  }
  if (s->abandoned && s->released) delete s;
}
static void teardown(napi_async_cleanup_hook_handle hook, void* data) {
  auto s = static_cast<Session*>(data);
  s->teardown = true;
  if (!s->released && s->job.value) TerminateJobObject(s->job.value, 1);
  if (s->drained) {
    try { release(s); } catch (...) {}
    napi_remove_async_cleanup_hook(hook); s->cleanup = nullptr;
  } else {
    // Acquire a temporary producer reference so abort does not steal a worker's ref.
    napi_acquire_threadsafe_function(s->events);
    napi_release_threadsafe_function(s->events, napi_tsfn_abort);
  }
}
static std::wstring string(napi_env env, napi_value value, size_t limit = SIZE_MAX) {
  size_t size = 0; napiCheck(napi_get_value_string_utf16(env, value, nullptr, 0, &size));
  check(size <= limit, "Process string exceeds limit");
  std::u16string result(size + 1, 0);
  napiCheck(napi_get_value_string_utf16(env, value, result.data(), result.size(), &size));
  result.resize(size); check(result.find(u'\0') == std::u16string::npos, "NUL in process argument");
  return std::wstring(result.begin(), result.end());
}
static std::wstring quote(const std::wstring& input) {
  std::wstring result = L"\""; size_t slashes = 0;
  for (wchar_t c : input) {
    if (c == L'\\') { ++slashes; continue; }
    result.append(c == L'"' ? slashes * 2 + 1 : slashes, L'\\'); slashes = 0;
    result += c;
  }
  result.append(slashes * 2, L'\\'); return result + L"\"";
}
// Run-only defense in depth. Main resolves and authorizes these paths; never
// search PATH/cwd or infer an executable from a command string in this binding.
static void runPath(const std::wstring& path, bool directory) {
  const bool drive = path.size() >= 3 && ((path[0] >= L'A' && path[0] <= L'Z')
    || (path[0] >= L'a' && path[0] <= L'z')) && path[1] == L':'
    && (path[2] == L'\\' || path[2] == L'/');
  const auto share = path.find(L'\\', 2);
  const bool unc = path.size() > 2 && path[0] == L'\\' && path[1] == L'\\'
    && path[2] != L'?' && path[2] != L'.' && share != std::wstring::npos
    && share > 2 && share + 1 < path.size() && path[share + 1] != L'\\';
  check((drive || unc) && path.find_first_of(L"\"*?\r\n") == std::wstring::npos,
    "Run requires fully qualified executable and cwd");
  if (!directory) check(path.size() >= 4 && _wcsicmp(path.c_str() + path.size() - 4, L".exe") == 0,
    "Run requires a native executable");
  DWORD attributes = GetFileAttributesW(path.c_str());
  check(attributes != INVALID_FILE_ATTRIBUTES && bool(attributes & FILE_ATTRIBUTE_DIRECTORY) == directory,
    "Invalid Run executable or cwd");
}
static napi_value create(napi_env env, napi_callback_info info) {
  std::unique_ptr<Session> s = std::make_unique<Session>();
  try {
    size_t argc = 5; napi_value argv[5]; void* mode = nullptr;
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, &mode));
    check(argc == 5, "Expected executable, arguments, cwd, environment, observer");
    const bool runArray = mode && *static_cast<int*>(mode) == 3;
    s->csharp = mode && *static_cast<int*>(mode) == 2;
    const size_t limit = runArray ? 32766 : SIZE_MAX;
    auto executable = string(env, argv[0], limit), cwd = string(env, argv[2], limit);
    if (runArray) {
      runPath(executable, false); runPath(cwd, true);
      napi_valuetype type; napiCheck(napi_typeof(env, argv[4], &type));
      check(type == napi_function, "Run observer must be a function");
    }
    auto command = quote(executable);
    if (mode) {
      // Dedicated Run array entry; legacy Run/Git/LSP signatures remain compatible.
      uint32_t count; napiCheck(napi_get_array_length(env, argv[1], &count));
      if (runArray) check(count <= 1024, "Too many Run arguments");
      for (uint32_t i = 0; i < count; ++i) {
        napi_value value; napiCheck(napi_get_element(env, argv[1], i, &value));
        auto argument = quote(string(env, value, limit));
        if (runArray) check(command.size() + 1 + argument.size() <= limit, "Run command line exceeds limit");
        command += L" " + argument;
      }
    } else command += L" " + quote(string(env, argv[1]));
    if (runArray) check(command.size() <= limit, "Run command line exceeds limit");
    uint32_t envCount; napiCheck(napi_get_array_length(env, argv[3], &envCount));
    if (runArray) check(envCount <= 32767, "Run environment exceeds limit");
    std::wstring environment;
    for (uint32_t i = 0; i < envCount; ++i) {
      napi_value value; napiCheck(napi_get_element(env, argv[3], i, &value));
      auto entry = string(env, value, limit); check(entry.find(L'=') != std::wstring::npos, "Invalid environment entry");
      if (runArray) check(entry.find(L'=') > 0 && environment.size() + entry.size() + 2 <= 32767,
        "Invalid or oversized Run environment");
      environment += entry; environment += L'\0';
    }
    environment += L'\0'; if (!envCount) environment += L'\0';
    Handle outWrite, errWrite, input, thread;
    SECURITY_ATTRIBUTES sa{sizeof(sa), nullptr, TRUE};
    check(CreatePipe(&s->out.value, &outWrite.value, &sa, 0), "stdout pipe failed");
    check(CreatePipe(&s->err.value, &errWrite.value, &sa, 0), "stderr pipe failed");
    check(SetHandleInformation(s->out.value, HANDLE_FLAG_INHERIT, 0), "stdout inherit failed");
    check(SetHandleInformation(s->err.value, HANDLE_FLAG_INHERIT, 0), "stderr inherit failed");
    if (s->csharp) {
      check(CreatePipe(&input.value, &s->inputWrite.value, &sa, 0), "C# stdin pipe failed");
      check(SetHandleInformation(s->inputWrite.value, HANDLE_FLAG_INHERIT, 0), "C# stdin inherit failed");
    } else input.value = CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
      &sa, OPEN_EXISTING, 0, nullptr);
    check(input.value != INVALID_HANDLE_VALUE, "stdin creation failed");
    check(spikeFault != 1, "Injected Job creation failure");
    s->job.value = CreateJobObjectW(nullptr, nullptr); check(s->job.value != nullptr, "Job creation failed");
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    check(SetInformationJobObject(s->job.value, JobObjectExtendedLimitInformation, &limits, sizeof(limits)), "Kill-on-close setup failed");
    limitsSetup(s.get());
    SIZE_T size = 0; InitializeProcThreadAttributeList(nullptr, 2, 0, &size);
    std::vector<unsigned char> bytes(size);
    auto attributes = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(bytes.data());
    check(InitializeProcThreadAttributeList(attributes, 2, 0, &size), "Attributes failed");
    struct AttributeGuard { LPPROC_THREAD_ATTRIBUTE_LIST p; ~AttributeGuard() { DeleteProcThreadAttributeList(p); } } guard{attributes};
    check(UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST,
      &s->job.value, sizeof(HANDLE), nullptr, nullptr), "Creation Job list failed");
    HANDLE inherited[] = {input.value, outWrite.value, errWrite.value};
    check(UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
      inherited, sizeof(inherited), nullptr, nullptr), "Handle list failed");
    STARTUPINFOEXW startup{}; startup.StartupInfo.cb = sizeof(startup);
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = input.value; startup.StartupInfo.hStdOutput = outWrite.value;
    startup.StartupInfo.hStdError = errWrite.value; startup.lpAttributeList = attributes;
    PROCESS_INFORMATION process{};
    check(spikeFault != 2, "Injected spawn failure");
    check(CreateProcessW(executable.c_str(), command.data(), nullptr, nullptr, TRUE,
      EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | CREATE_SUSPENDED,
      environment.data(), cwd.c_str(), &startup.StartupInfo, &process), "Node process creation failed");
    s->root.value = process.hProcess; s->pid = process.dwProcessId; thread.value = process.hThread;
    BOOL owned = FALSE; check(IsProcessInJob(s->root.value, s->job.value, &owned) && owned, "Job membership failed");
    outWrite.close(); errWrite.close(); input.close();
    napiCheck(napi_create_reference(env, argv[4], 1, &s->callback));
    napiCheck(napi_create_threadsafe_function(env, argv[4], nullptr, text(env, "Run pipes"),
      64, 1, s.get(), finalizeEvents, nullptr, callEvent, &s->events));
    napiCheck(napi_add_async_cleanup_hook(env, teardown, s.get(), &s->cleanup));
    auto value = s.get();
    napi_acquire_threadsafe_function(value->events);
    try { value->stdoutThread = std::thread(readPipe, value, value->out.value, "stdout"); }
    catch (...) { napi_release_threadsafe_function(value->events, napi_tsfn_release); throw; }
    napi_acquire_threadsafe_function(value->events);
    try { value->stderrThread = std::thread(readPipe, value, value->err.value, "stderr"); }
    catch (...) { napi_release_threadsafe_function(value->events, napi_tsfn_release); throw; }
    napi_acquire_threadsafe_function(value->events);
    try { value->rootThread = std::thread([value] {
      DWORD code = 0;
      if (WaitForSingleObject(value->root.value, INFINITE) == WAIT_OBJECT_0
        && GetExitCodeProcess(value->root.value, &code)) send(value, {"exit", "", code});
      else send(value, {"error", "", 0});
      napi_release_threadsafe_function(value->events, napi_tsfn_release);
    }); } catch (...) { napi_release_threadsafe_function(value->events, napi_tsfn_release); throw; }
    // User code cannot run until every observer owns its resources.
    check(ResumeThread(thread.value) != DWORD(-1), "Node thread resume failed");
    napi_value external;
    napiCheck(napi_create_external(env, value, [](napi_env, void* p, void*) {
      auto session = static_cast<Session*>(p);
      if (session->released && !session->cleanup) delete session;
    }, nullptr, &external));
    napi_release_threadsafe_function(value->events, napi_tsfn_release);
    s.release();
    return external;
  } catch (const std::exception& error) {
    if (s && s->job.value) {
      TerminateJobObject(s->job.value, 1);
      if (s->root.value) WaitForSingleObject(s->root.value, 5000);
    }
    if (s && s->events) {
      s->teardown = true; s->abandoned = true;
      napi_release_threadsafe_function(s->events, napi_tsfn_abort);
      s.release(); // Finalizer owns rollback after all producers settle.
    } else if (s && s->callback) napi_delete_reference(env, s->callback);
    napi_throw_error(env, nullptr, error.what()); return nullptr;
  }
}
static napi_value control(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 2; napi_value argv[2]; napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    check(argc == 2, "Expected owned session and operation");
    Session* s; napiCheck(napi_get_value_external(env, argv[0], reinterpret_cast<void**>(&s)));
    const auto op = string(env, argv[1]);
    napi_value result; napiCheck(napi_get_undefined(env, &result));
    if (op == L"pid") napiCheck(napi_create_uint32(env, s->pid, &result));
    else if (op == L"count") napiCheck(napi_create_uint32(env, s->released ? 0 : active(s), &result));
    else if (op == L"terminate") { check(spikeFault != 3, "Injected terminate failure"); if (!s->released) check(TerminateJobObject(s->job.value, 1), "Job termination failed"); }
    else if (op == L"release") {
      release(s);
      if (s->cleanup) { napi_remove_async_cleanup_hook(s->cleanup); s->cleanup = nullptr; }
    } else throw std::runtime_error("Unknown native operation");
    return result;
  } catch (const std::exception& error) { napi_throw_error(env, nullptr, error.what()); return nullptr; }
}
// Only the dedicated C# entry point has writable stdin. Writable's callback
// serializes writes in Main; blocking pipe IO runs off the JS thread.
struct CsharpWrite {
  Session* session;
  std::string bytes;
  napi_async_work work = nullptr;
  napi_ref owner = nullptr, callback = nullptr;
  bool success = false;
};
static napi_value writeCsharp(napi_env env, napi_callback_info info) {
  auto write = std::make_unique<CsharpWrite>();
  try {
    size_t argc = 3; napi_value argv[3];
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    check(argc == 3, "Expected C# session, bytes, callback");
    napiCheck(napi_get_value_external(env, argv[0], reinterpret_cast<void**>(&write->session)));
    auto s = write->session;
    check(s->csharp && !s->released && !s->teardown && s->pendingWrites == 0, "C# stdin unavailable");
    void* data; size_t size;
    napiCheck(napi_get_buffer_info(env, argv[1], &data, &size));
    check(size <= 16 * 1024 * 1024, "C# stdin chunk exceeds bound");
    write->bytes.assign(static_cast<char*>(data), size);
    napiCheck(napi_create_reference(env, argv[0], 1, &write->owner));
    napiCheck(napi_create_reference(env, argv[2], 1, &write->callback));
    napiCheck(napi_create_async_work(env, nullptr, text(env, "C# stdin"),
      [](napi_env, void* value) {
        auto w = static_cast<CsharpWrite*>(value); size_t offset = 0;
        while (offset < w->bytes.size()) {
          DWORD count = 0;
          if (!WriteFile(w->session->inputWrite.value, w->bytes.data() + offset,
            static_cast<DWORD>(w->bytes.size() - offset), &count, nullptr) || !count) return;
          offset += count;
        }
        w->success = true;
      }, [](napi_env env, napi_status status, void* value) {
        std::unique_ptr<CsharpWrite> w(static_cast<CsharpWrite*>(value));
        --w->session->pendingWrites;
        napi_value callback, receiver, result, ignored;
        napi_get_reference_value(env, w->callback, &callback);
        napi_get_undefined(env, &receiver);
        napi_get_boolean(env, status == napi_ok && w->success, &result);
        napi_call_function(env, receiver, callback, 1, &result, &ignored);
        napi_delete_reference(env, w->callback); napi_delete_reference(env, w->owner);
        napi_delete_async_work(env, w->work);
      }, write.get(), &write->work));
    napiCheck(napi_queue_async_work(env, write->work));
    ++s->pendingWrites; write.release();
    napi_value result; napi_get_undefined(env, &result); return result;
  } catch (const std::exception& error) {
    if (write->work) napi_delete_async_work(env, write->work);
    if (write->callback) napi_delete_reference(env, write->callback);
    if (write->owner) napi_delete_reference(env, write->owner);
    napi_throw_error(env, nullptr, error.what()); return nullptr;
  }
}
// SPIKE ONLY. Process handles prevent PID-reuse ambiguity; file handle denies deletion.
static napi_value spikeSetFault(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  napi_get_value_int32(env, argv[0], &spikeFault);
  napi_value result; napi_get_undefined(env, &result); return result;
}
static napi_value spikeHandle(napi_env env, HANDLE handle) {
  auto owned = new Handle(); owned->value = handle;
  napi_value result;
  napi_create_external(env, owned, [](napi_env, void* p, void*) { delete static_cast<Handle*>(p); }, nullptr, &result);
  return result;
}
static napi_value spikeWatch(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; uint32_t pid = 0;
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr); napi_get_value_uint32(env, argv[0], &pid);
  HANDLE handle = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!handle) { napi_throw_error(env, nullptr, "Cannot open observed process"); return nullptr; }
  return spikeHandle(env, handle);
}
static napi_value spikeAlive(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; void* p = nullptr;
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr); napi_get_value_external(env, argv[0], &p);
  const auto handle = static_cast<Handle*>(p)->value;
  napi_value result; napi_get_boolean(env, handle && WaitForSingleObject(handle, 0) == WAIT_TIMEOUT, &result); return result;
}
static napi_value spikeCloseHandle(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; void* p = nullptr;
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr); napi_get_value_external(env, argv[0], &p);
  try { static_cast<Handle*>(p)->close(); } catch (...) { napi_throw_error(env, nullptr, "Test handle close failed"); return nullptr; }
  napi_value result; napi_get_undefined(env, &result); return result;
}
static napi_value spikeLock(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  try {
    auto path = string(env, argv[0]);
    HANDLE handle = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
      nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (handle == INVALID_HANDLE_VALUE) { napi_throw_error(env, nullptr, "Test file lock failed"); return nullptr; }
    return spikeHandle(env, handle);
  } catch (...) { napi_throw_error(env, nullptr, "Invalid test lock path"); return nullptr; }
}
// Observation only: query this exact integration-created Job, never assign/terminate/release.
static napi_value spikeJobMembers(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1; napi_value argv[1]; void* p = nullptr;
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    check(argc == 1, "Expected owned native session");
    napiCheck(napi_get_value_external(env, argv[0], &p));
    auto s = static_cast<Session*>(p);
    check(s && !s->released && s->job.value, "Observed Job is not owned/open");
    for (size_t capacity = 16; capacity <= 4096; capacity *= 2) {
      const size_t bytes = sizeof(JOBOBJECT_BASIC_PROCESS_ID_LIST) + capacity * sizeof(ULONG_PTR);
      std::vector<unsigned char> buffer(bytes, 0);
      auto list = reinterpret_cast<JOBOBJECT_BASIC_PROCESS_ID_LIST*>(buffer.data());
      if (!QueryInformationJobObject(s->job.value, JobObjectBasicProcessIdList, list,
          static_cast<DWORD>(bytes), nullptr)) {
        if (GetLastError() == ERROR_MORE_DATA) continue;
        throw std::runtime_error("Job membership query failed");
      }
      napi_value result; napiCheck(napi_create_array_with_length(env, list->NumberOfProcessIdsInList, &result));
      for (DWORD i = 0; i < list->NumberOfProcessIdsInList; ++i) {
        napi_value pid; napiCheck(napi_create_uint32(env, static_cast<uint32_t>(list->ProcessIdList[i]), &pid));
        napiCheck(napi_set_element(env, result, i, pid));
      }
      return result;
    }
    throw std::runtime_error("Job observer process bound exceeded");
  } catch (const std::exception& e) { napi_throw_error(env, nullptr, e.what()); return nullptr; }
}
static napi_value spikeProcessImage(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; void* p = nullptr;
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr); napi_get_value_external(env, argv[0], &p);
  wchar_t path[32768]; DWORD length = 32768;
  if (!p || !QueryFullProcessImageNameW(static_cast<Handle*>(p)->value, 0, path, &length)) {
    napi_throw_error(env, nullptr, "Observed process image unavailable"); return nullptr;
  }
  napi_value result; napi_create_string_utf16(env, reinterpret_cast<const char16_t*>(path), length, &result); return result;
}
// Policy-B spike primitives: no blocking wait, no Job handle duplication.
static napi_value spikeWaitState(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1; napi_value argv[1]; void* p = nullptr;
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    check(argc == 1, "Expected retained process handle");
    napiCheck(napi_get_value_external(env, argv[0], &p));
    check(p && static_cast<Handle*>(p)->value, "Retained handle closed");
    const DWORD result = WaitForSingleObject(static_cast<Handle*>(p)->value, 0);
    check(result == WAIT_OBJECT_0 || result == WAIT_TIMEOUT, "Process wait failed");
    return text(env, result == WAIT_OBJECT_0 ? "SIGNALED" : "PENDING");
  } catch (const std::exception& e) { napi_throw_error(env, nullptr, e.what()); return nullptr; }
}
static napi_value accountingObject(napi_env env, HANDLE job) {
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
  check(QueryInformationJobObject(job, JobObjectBasicAccountingInformation, &accounting, sizeof(accounting), nullptr), "Accounting query failed");
  napi_value result; napiCheck(napi_create_object(env, &result));
  const char* keys[] = {"totalProcesses", "activeProcesses", "limitTerminations"};
  const DWORD values[] = {accounting.TotalProcesses, accounting.ActiveProcesses, accounting.TotalTerminatedProcesses};
  for (size_t i = 0; i < 3; ++i) { napi_value n; napiCheck(napi_create_uint32(env, values[i], &n)); napiCheck(napi_set_named_property(env, result, keys[i], n)); }
  return result;
}
static napi_value spikeAccounting(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1; napi_value argv[1]; void* p = nullptr;
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    napiCheck(napi_get_value_external(env, argv[0], &p));
    auto s = static_cast<Session*>(p); check(s && !s->released && s->job.value, "Accounting ownership lost");
    return accountingObject(env, s->job.value);
  } catch (const std::exception& e) { napi_throw_error(env, nullptr, e.what()); return nullptr; }
}
static napi_value spikeMemberIdentity(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 2; napi_value argv[2]; void* session = nullptr; void* process = nullptr;
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    check(argc == 2, "Expected Job session and observed process");
    napiCheck(napi_get_value_external(env, argv[0], &session)); napiCheck(napi_get_value_external(env, argv[1], &process));
    auto s = static_cast<Session*>(session); auto h = static_cast<Handle*>(process);
    check(s && !s->released && s->job.value && h && h->value, "Identity ownership lost");
    BOOL member = FALSE; check(IsProcessInJob(h->value, s->job.value, &member), "Membership identity query failed");
    FILETIME created{}, exited{}, kernel{}, user{};
    check(GetProcessTimes(h->value, &created, &exited, &kernel, &user), "Creation identity query failed");
    napi_value result, pid, isMember; napiCheck(napi_create_object(env, &result));
    napiCheck(napi_create_uint32(env, GetProcessId(h->value), &pid)); napiCheck(napi_get_boolean(env, member != FALSE, &isMember));
    napiCheck(napi_set_named_property(env, result, "pid", pid)); napiCheck(napi_set_named_property(env, result, "member", isMember));
    napiCheck(napi_set_named_property(env, result, "created", text(env, (std::to_string(created.dwHighDateTime) + ":" + std::to_string(created.dwLowDateTime)).c_str())));
    return result;
  } catch (const std::exception& e) { napi_throw_error(env, nullptr, e.what()); return nullptr; }
}
static napi_value spikeFailedAssociation(napi_env env, napi_callback_info info) {
  Handle job, accepted, rejected;
  try {
    size_t argc = 1; napi_value argv[1]; napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    auto exe = string(env, argv[0]);
    job.value = CreateJobObjectW(nullptr, nullptr); check(job.value != nullptr, "Probe Job creation failed");
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_ACTIVE_PROCESS | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    limits.BasicLimitInformation.ActiveProcessLimit = 1;
    check(SetInformationJobObject(job.value, JobObjectExtendedLimitInformation, &limits, sizeof(limits)), "Probe limit setup failed");
    auto spawnSuspended = [&](Handle& target) {
      auto command = quote(exe) + L" -e \"process.exit(0)\"";
      STARTUPINFOW startup{}; startup.cb = sizeof(startup); PROCESS_INFORMATION pi{};
      check(CreateProcessW(exe.c_str(), command.data(), nullptr, nullptr, FALSE,
        CREATE_SUSPENDED | CREATE_NO_WINDOW, nullptr, nullptr, &startup, &pi), "Probe CreateProcess failed");
      target.value = pi.hProcess; CloseHandle(pi.hThread); // Never resume user code.
    };
    spawnSuspended(accepted); check(AssignProcessToJobObject(job.value, accepted.value), "Initial association failed");
    napi_value before = accountingObject(env, job.value);
    spawnSuspended(rejected);
    const BOOL assigned = AssignProcessToJobObject(job.value, rejected.value); const DWORD error = assigned ? ERROR_SUCCESS : GetLastError();
    napi_value after = accountingObject(env, job.value);
    check(TerminateJobObject(job.value, 1), "Probe Job terminate failed");
    // Safety for any unassociated suspended process; no PID-based killing.
    if (!assigned) TerminateProcess(rejected.value, 1);
    napi_value result, success, code; napiCheck(napi_create_object(env, &result));
    napiCheck(napi_get_boolean(env, assigned != FALSE, &success)); napiCheck(napi_create_uint32(env, error, &code));
    napiCheck(napi_set_named_property(env, result, "assigned", success)); napiCheck(napi_set_named_property(env, result, "win32Error", code));
    napiCheck(napi_set_named_property(env, result, "before", before)); napiCheck(napi_set_named_property(env, result, "after", after));
    napiCheck(napi_set_named_property(env, result, "job", spikeHandle(env, job.value))); job.value = nullptr;
    napiCheck(napi_set_named_property(env, result, "accepted", spikeHandle(env, accepted.value))); accepted.value = nullptr;
    napiCheck(napi_set_named_property(env, result, "rejected", spikeHandle(env, rejected.value))); rejected.value = nullptr;
    return result;
  } catch (const std::exception& e) {
    if (job.value) TerminateJobObject(job.value, 1);
    if (accepted.value) TerminateProcess(accepted.value, 1);
    if (rejected.value) TerminateProcess(rejected.value, 1);
    napi_throw_error(env, nullptr, e.what()); return nullptr;
  }
}
static napi_value spikeAcquireLease(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1; napi_value argv[1];
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    check(argc == 1, "Expected owned lease path");
    const auto path = string(env, argv[0]);
    HANDLE h = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, 0,
      nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) {
      if (GetLastError() == ERROR_SHARING_VIOLATION) { napi_value result; napi_get_null(env, &result); return result; }
      throw std::runtime_error("Learning lease open failed");
    }
    return spikeHandle(env, h);
  } catch (const std::exception& e) { napi_throw_error(env, nullptr, e.what()); return nullptr; }
}
static napi_value spikeProcessIdentity(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1; napi_value argv[1]; void* p = nullptr;
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    check(argc == 1, "Expected retained process handle");
    napiCheck(napi_get_value_external(env, argv[0], &p));
    auto h = static_cast<Handle*>(p); check(h && h->value, "Identity handle closed");
    FILETIME created{}, exited{}, kernel{}, user{};
    check(GetProcessTimes(h->value, &created, &exited, &kernel, &user), "Observer creation identity failed");
    napi_value result, pid; napiCheck(napi_create_object(env, &result));
    napiCheck(napi_create_uint32(env, GetProcessId(h->value), &pid));
    napiCheck(napi_set_named_property(env, result, "pid", pid));
    napiCheck(napi_set_named_property(env, result, "created", text(env, (std::to_string(created.dwHighDateTime) + ":" + std::to_string(created.dwLowDateTime)).c_str())));
    return result;
  } catch (const std::exception& e) { napi_throw_error(env, nullptr, e.what()); return nullptr; }
}
static void addSpikeHelpers(napi_env env, napi_value exports) {
  napi_property_descriptor helpers[] = {
    {"setFault", nullptr, spikeSetFault, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"watch", nullptr, spikeWatch, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"alive", nullptr, spikeAlive, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"closeHandle", nullptr, spikeCloseHandle, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"lockFile", nullptr, spikeLock, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"jobMembers", nullptr, spikeJobMembers, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"processImage", nullptr, spikeProcessImage, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"waitState", nullptr, spikeWaitState, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"accounting", nullptr, spikeAccounting, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"memberIdentity", nullptr, spikeMemberIdentity, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"failedAssociation", nullptr, spikeFailedAssociation, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"acquireLease", nullptr, spikeAcquireLease, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"processIdentity", nullptr, spikeProcessIdentity, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 13, helpers);
}

// SPIKE ONLY. Quota configured while the Job is empty, before CreateProcess.
static SIZE_T nextMemoryQuota = 0;
static void limitsSetup(Session* s) {
  check(nextMemoryQuota >= 16ull * 1024 * 1024 && nextMemoryQuota <= 2ull * 1024 * 1024 * 1024, "Quota outside test bounds");
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limit{};
  limit.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_JOB_MEMORY;
  limit.JobMemoryLimit = nextMemoryQuota; nextMemoryQuota = 0;
  check(SetInformationJobObject(s->job.value, JobObjectExtendedLimitInformation, &limit, sizeof(limit)), "Memory quota setup failed");
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION actual{};
  check(QueryInformationJobObject(s->job.value, JobObjectExtendedLimitInformation, &actual, sizeof(actual), nullptr), "Quota readback failed");
  check(actual.JobMemoryLimit == limit.JobMemoryLimit && (actual.BasicLimitInformation.LimitFlags & JOB_OBJECT_LIMIT_JOB_MEMORY), "Quota readback mismatch");
  s->configuredQuota = actual.JobMemoryLimit;
  s->memoryPort.value = CreateIoCompletionPort(INVALID_HANDLE_VALUE, nullptr, 0, 1);
  check(s->memoryPort.value != nullptr, "Memory completion port creation failed");
  JOBOBJECT_ASSOCIATE_COMPLETION_PORT port{}; port.CompletionKey = s; port.CompletionPort = s->memoryPort.value;
  check(SetInformationJobObject(s->job.value, JobObjectAssociateCompletionPortInformation, &port, sizeof(port)), "Memory completion association failed");
  JOBOBJECT_NOTIFICATION_LIMIT_INFORMATION notification{};
  notification.LimitFlags = JOB_OBJECT_LIMIT_JOB_MEMORY; notification.JobMemoryLimit = actual.JobMemoryLimit;
  check(SetInformationJobObject(s->job.value, JobObjectNotificationLimitInformation, &notification, sizeof(notification)), "Memory notification setup failed");
}
static napi_value limitsConfigure(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1; napi_value argv[1]; double bytes = 0;
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    check(argc == 1, "Expected quota bytes"); napiCheck(napi_get_value_double(env, argv[0], &bytes));
    check(bytes >= 16.0 * 1024 * 1024 && bytes <= 2.0 * 1024 * 1024 * 1024, "Invalid quota");
    nextMemoryQuota = static_cast<SIZE_T>(bytes);
    napi_value result; napi_get_undefined(env, &result); return result;
  } catch (const std::exception& e) { napi_throw_error(env, nullptr, e.what()); return nullptr; }
}
static napi_value limitsMemory(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1; napi_value argv[1]; void* p = nullptr;
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr)); napiCheck(napi_get_value_external(env, argv[0], &p));
    auto s = static_cast<Session*>(p); check(s && !s->released && s->job.value, "Memory query after release forbidden");
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limit{};
    check(QueryInformationJobObject(s->job.value, JobObjectExtendedLimitInformation, &limit, sizeof(limit), nullptr), "Memory query failed");
    napi_value result; napiCheck(napi_create_object(env, &result));
    auto number = [&](const char* key, double value) { napi_value n; napiCheck(napi_create_double(env, value, &n)); napiCheck(napi_set_named_property(env, result, key, n)); };
    number("quotaBytes", static_cast<double>(limit.JobMemoryLimit));
    number("configuredBeforeLaunch", static_cast<double>(s->configuredQuota));
    number("peakJobCommitBytes", static_cast<double>(limit.PeakJobMemoryUsed));
    number("flags", static_cast<double>(limit.BasicLimitInformation.LimitFlags));
    JOBOBJECT_LIMIT_VIOLATION_INFORMATION violation{};
    if (QueryInformationJobObject(s->job.value, JobObjectLimitViolationInformation, &violation, sizeof(violation), nullptr)) {
      number("jobCommitReportedBytes", static_cast<double>(violation.JobMemory));
      number("violationFlags", static_cast<double>(violation.ViolationLimitFlags));
    }
    napi_value events; napiCheck(napi_create_array(env, &events)); uint32_t index = 0;
    for (;;) {
      DWORD message = 0; ULONG_PTR key = 0; LPOVERLAPPED pid = nullptr;
      const BOOL ok = GetQueuedCompletionStatus(s->memoryPort.value, &message, &key, &pid, 0);
      if (!ok) { check(GetLastError() == WAIT_TIMEOUT, "Memory completion read failed"); break; }
      check(key == reinterpret_cast<ULONG_PTR>(s), "Completion Job identity mismatch");
      napi_value event, n; napiCheck(napi_create_object(env, &event));
      napiCheck(napi_create_uint32(env, message, &n)); napiCheck(napi_set_named_property(env, event, "message", n));
      napiCheck(napi_create_double(env, static_cast<double>(reinterpret_cast<ULONG_PTR>(pid)), &n)); napiCheck(napi_set_named_property(env, event, "pid", n));
      napiCheck(napi_set_element(env, events, index++, event));
    }
    napiCheck(napi_set_named_property(env, result, "events", events)); return result;
  } catch (const std::exception& e) { napi_throw_error(env, nullptr, e.what()); return nullptr; }
}
static napi_value limitsGate(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1; napi_value argv[1]; napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    const auto name = string(env, argv[0]);
    HANDLE gate = CreateEventW(nullptr, TRUE, FALSE, name.c_str()); check(gate != nullptr, "Gate create failed");
    return spikeHandle(env, gate);
  } catch (const std::exception& e) { napi_throw_error(env, nullptr, e.what()); return nullptr; }
}
static napi_value limitsSignal(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1; napi_value argv[1]; void* p = nullptr; napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    napiCheck(napi_get_value_external(env, argv[0], &p)); check(SetEvent(static_cast<Handle*>(p)->value), "Gate signal failed");
    napi_value result; napi_get_undefined(env, &result); return result;
  } catch (const std::exception& e) { napi_throw_error(env, nullptr, e.what()); return nullptr; }
}
static void addLimitsHelpers(napi_env env, napi_value exports) {
  napi_property_descriptor helpers[] = {
    {"configureMemory", nullptr, limitsConfigure, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"memory", nullptr, limitsMemory, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"gate", nullptr, limitsGate, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"signalGate", nullptr, limitsSignal, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napiCheck(napi_define_properties(env, exports, 4, helpers));
}

static napi_value init(napi_env env, napi_value exports) {
  addLimitsHelpers(env, exports);
  addSpikeHelpers(env, exports);
  static int gitMode = 1;
  static int csharpMode = 2;
  static int runMode = 3; // Closed stdin; never enables the C# language writer.
  napi_property_descriptor methods[] = {
    {"create", nullptr, create, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"createRun", nullptr, create, nullptr, nullptr, nullptr, napi_default, &runMode},
    {"control", nullptr, control, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"createGit", nullptr, create, nullptr, nullptr, nullptr, napi_default, &gitMode},
    {"createCsharp", nullptr, create, nullptr, nullptr, nullptr, napi_default, &csharpMode},
    {"createCsharpPreflight", nullptr, create, nullptr, nullptr, nullptr, napi_default, &gitMode},
    {"writeCsharp", nullptr, writeCsharp, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 7, methods);
  napi_set_named_property(env, exports, "capability", text(env, "student-ide-piped-job-v1"));
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
