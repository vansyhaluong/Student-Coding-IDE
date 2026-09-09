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

static void check(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
static void napiCheck(napi_status s) { check(s == napi_ok, "Native binding operation failed"); }
struct Handle {
  HANDLE value = nullptr;
  ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
  void close() { if (value) { check(CloseHandle(value) != 0, "Native handle release failed"); value = nullptr; } }
};
struct Session {
  Handle job, root, out, err;
  DWORD pid = 0;
  napi_threadsafe_function events = nullptr;
  napi_ref callback = nullptr;
  napi_async_cleanup_hook_handle cleanup = nullptr;
  std::thread stdoutThread, stderrThread, rootThread;
  std::atomic<bool> teardown{false};
  bool drained = false, released = false, abandoned = false;
};
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
  check(s->drained && active(s) == 0 && WaitForSingleObject(s->root.value, 0) == WAIT_OBJECT_0,
    "Native process is not ready for release");
  s->out.close(); s->err.close(); s->root.close(); s->job.close(); s->released = true;
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
static std::wstring string(napi_env env, napi_value value) {
  size_t size = 0; napiCheck(napi_get_value_string_utf16(env, value, nullptr, 0, &size));
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
static napi_value create(napi_env env, napi_callback_info info) {
  std::unique_ptr<Session> s = std::make_unique<Session>();
  try {
    size_t argc = 5; napi_value argv[5]; void* mode = nullptr;
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, &mode));
    check(argc == 5, "Expected executable, target, cwd, environment, observer");
    auto executable = string(env, argv[0]), cwd = string(env, argv[2]);
    auto command = quote(executable);
    if (mode) {
      // Private Git adapter only. Run retains its original single-target entry.
      uint32_t count; napiCheck(napi_get_array_length(env, argv[1], &count));
      for (uint32_t i = 0; i < count; ++i) {
        napi_value value; napiCheck(napi_get_element(env, argv[1], i, &value));
        command += L" " + quote(string(env, value));
      }
    } else command += L" " + quote(string(env, argv[1]));
    uint32_t envCount; napiCheck(napi_get_array_length(env, argv[3], &envCount));
    std::wstring environment;
    for (uint32_t i = 0; i < envCount; ++i) {
      napi_value value; napiCheck(napi_get_element(env, argv[3], i, &value));
      auto entry = string(env, value); check(entry.find(L'=') != std::wstring::npos, "Invalid environment entry");
      environment += entry; environment += L'\0';
    }
    environment += L'\0'; if (!envCount) environment += L'\0';
    Handle outWrite, errWrite, input, thread;
    SECURITY_ATTRIBUTES sa{sizeof(sa), nullptr, TRUE};
    check(CreatePipe(&s->out.value, &outWrite.value, &sa, 0), "stdout pipe failed");
    check(CreatePipe(&s->err.value, &errWrite.value, &sa, 0), "stderr pipe failed");
    check(SetHandleInformation(s->out.value, HANDLE_FLAG_INHERIT, 0), "stdout inherit failed");
    check(SetHandleInformation(s->err.value, HANDLE_FLAG_INHERIT, 0), "stderr inherit failed");
    input.value = CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
      &sa, OPEN_EXISTING, 0, nullptr);
    check(input.value != INVALID_HANDLE_VALUE, "stdin creation failed");
    s->job.value = CreateJobObjectW(nullptr, nullptr); check(s->job.value != nullptr, "Job creation failed");
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
    else if (op == L"terminate") { if (!s->released) check(TerminateJobObject(s->job.value, 1), "Job termination failed"); }
    else if (op == L"release") {
      release(s);
      if (s->cleanup) { napi_remove_async_cleanup_hook(s->cleanup); s->cleanup = nullptr; }
    } else throw std::runtime_error("Unknown native operation");
    return result;
  } catch (const std::exception& error) { napi_throw_error(env, nullptr, error.what()); return nullptr; }
}
static napi_value init(napi_env env, napi_value exports) {
  static int gitMode = 1;
  napi_property_descriptor methods[] = {
    {"create", nullptr, create, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"control", nullptr, control, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"createGit", nullptr, create, nullptr, nullptr, nullptr, napi_default, &gitMode},
  };
  napi_define_properties(env, exports, 3, methods);
  napi_set_named_property(env, exports, "capability", text(env, "student-ide-piped-job-v1"));
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
