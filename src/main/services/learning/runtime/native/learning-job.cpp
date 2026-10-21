// Main-only Learning binding. Independent Job/lease ownership; no Project adapter imports.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <node_api.h>
#include <algorithm>
#include <cmath>
#include <memory>
#include <string>
#include <vector>
#include <unordered_set>
#include <stdexcept>

struct Failure : std::runtime_error {
  const char* code; DWORD win32;
  Failure(const char* c, DWORD w) : std::runtime_error(c), code(c), win32(w) {}
};
static void require(bool ok, const char* code) { if (!ok) throw Failure(code, GetLastError()); }
static void js(napi_status s) { if (s != napi_ok) throw Failure("LEARNING_ARGUMENT", 0); }
struct Handle {
  HANDLE value = nullptr;
  ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
  void close() { if (value) { require(CloseHandle(value) != 0, "LEARNING_CLOSE"); value = nullptr; } }
};
struct Process { Handle handle; DWORD pid = 0; std::string created; };
struct Job {
  Handle job, port, out, err, rootThread;
  std::vector<std::unique_ptr<Process>> retained;
  DWORD rootPid = 0;
  SIZE_T quota = 0;
  bool gap = false, outEof = false, errEof = false, resumed = false, terminated = false, released = false, handlesClosed = false;
};
struct Observation { Handle handle; bool lease = false; };
static std::unordered_set<Job*> jobs;
static std::unordered_set<Observation*> observations;
static napi_value undef(napi_env e) { napi_value v; js(napi_get_undefined(e, &v)); return v; }
static napi_value object(napi_env e) { napi_value v; js(napi_create_object(e, &v)); return v; }
static napi_value text(napi_env e, const std::string& s) { napi_value v; js(napi_create_string_utf8(e, s.data(), s.size(), &v)); return v; }
static void prop(napi_env e, napi_value v, const char* k, napi_value x) { js(napi_set_named_property(e, v, k, x)); }
static void number(napi_env e, napi_value v, const char* k, double x) { napi_value n; js(napi_create_double(e, x, &n)); prop(e, v, k, n); }
static void boolean(napi_env e, napi_value v, const char* k, bool x) { napi_value n; js(napi_get_boolean(e, x, &n)); prop(e, v, k, n); }
static napi_value error(napi_env e, const std::exception& ex) {
  auto f = dynamic_cast<const Failure*>(&ex);
  napi_value err; napi_create_error(e, text(e, f ? f->code : "LEARNING_NATIVE"), text(e, "Learning native operation failed."), &err);
  number(e, err, "win32", f ? f->win32 : 0); napi_throw(e, err); return nullptr;
}
static std::vector<napi_value> args(napi_env e, napi_callback_info i, size_t count) {
  std::vector<napi_value> a(count + 1); size_t n = a.size(); js(napi_get_cb_info(e, i, &n, a.data(), nullptr, nullptr));
  require(n == count, "LEARNING_ARGUMENT"); a.resize(count); return a;
}
static std::wstring wide(napi_env e, napi_value v) {
  size_t n = 0; js(napi_get_value_string_utf16(e, v, nullptr, 0, &n)); require(n <= 32767, "LEARNING_ARGUMENT");
  std::u16string s(n + 1, 0); js(napi_get_value_string_utf16(e, v, s.data(), s.size(), &n)); s.resize(n);
  require(s.find(u'\0') == std::u16string::npos, "LEARNING_ARGUMENT"); return std::wstring(s.begin(), s.end());
}
static bool absolute(const std::wstring& s) {
  return (s.size() >= 3 && ((s[0] >= L'A' && s[0] <= L'Z') || (s[0] >= L'a' && s[0] <= L'z')) && s[1] == L':' && s[2] == L'\\')
    || (s.size() > 2 && s[0] == L'\\' && s[1] == L'\\');
}
static std::wstring quote(const std::wstring& s) {
  std::wstring out = L"\""; size_t slashes = 0;
  for (wchar_t c : s) { if (c == L'\\') { ++slashes; continue; } out.append(c == L'"' ? slashes * 2 + 1 : slashes, L'\\'); slashes = 0; out += c; }
  out.append(slashes * 2, L'\\'); return out + L"\"";
}
static Job* owned(napi_env e, napi_value v) {
  void* p = nullptr; js(napi_get_value_external(e, v, &p)); auto j = static_cast<Job*>(p);
  require(jobs.count(j) != 0, "LEARNING_OWNERSHIP"); return j;
}
static Observation* observed(napi_env e, napi_value v) {
  void* p = nullptr; js(napi_get_value_external(e, v, &p)); auto h = static_cast<Observation*>(p);
  require(observations.count(h) != 0, "LEARNING_OWNERSHIP"); return h;
}
static bool signaled(HANDLE h) {
  const DWORD s = WaitForSingleObject(h, 0); require(s == WAIT_OBJECT_0 || s == WAIT_TIMEOUT, "LEARNING_WAIT"); return s == WAIT_OBJECT_0;
}
static std::string creation(HANDLE h) {
  FILETIME c{}, x{}, k{}, u{}; require(GetProcessTimes(h, &c, &x, &k, &u), "LEARNING_IDENTITY");
  return std::to_string(c.dwHighDateTime) + ":" + std::to_string(c.dwLowDateTime);
}
static napi_value identity(napi_env e, HANDLE h) {
  auto v = object(e); number(e, v, "pid", GetProcessId(h)); prop(e, v, "created", text(e, creation(h))); boolean(e, v, "signaled", signaled(h)); return v;
}
static std::vector<DWORD> members(Job* j) {
  require(!j->released && j->job.value, "LEARNING_OWNERSHIP");
  for (size_t cap = 16; cap <= 4096; cap *= 2) {
    const size_t size = sizeof(JOBOBJECT_BASIC_PROCESS_ID_LIST) + cap * sizeof(ULONG_PTR);
    std::vector<unsigned char> bytes(size); auto list = reinterpret_cast<JOBOBJECT_BASIC_PROCESS_ID_LIST*>(bytes.data());
    if (!QueryInformationJobObject(j->job.value, JobObjectBasicProcessIdList, list, static_cast<DWORD>(size), nullptr)) {
      if (GetLastError() == ERROR_MORE_DATA) continue;
      throw Failure("LEARNING_QUERY", GetLastError());
    }
    std::vector<DWORD> result;
    for (DWORD n = 0; n < list->NumberOfProcessIdsInList; ++n) result.push_back(static_cast<DWORD>(list->ProcessIdList[n]));
    return result;
  }
  throw Failure("LEARNING_QUERY", ERROR_MORE_DATA);
}
static void capture(Job* j, DWORD pid) {
  for (const auto& p : j->retained) if (p->pid == pid && !signaled(p->handle.value)) return;
  auto p = std::make_unique<Process>(); p->handle.value = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!p->handle.value) {
    const auto list = members(j);
    require(std::find(list.begin(), list.end(), pid) == list.end(), "LEARNING_IDENTITY"); j->gap = true; return;
  }
  BOOL member = FALSE; require(IsProcessInJob(p->handle.value, j->job.value, &member), "LEARNING_IDENTITY");
  if (!member) { j->gap = true; return; }
  p->pid = GetProcessId(p->handle.value); p->created = creation(p->handle.value);
  for (const auto& old : j->retained) if (old->pid == p->pid && old->created == p->created) return;
  require(j->retained.size() < 4096, "LEARNING_QUERY"); j->retained.push_back(std::move(p));
}
static JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting(Job* j) {
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION a{};
  require(QueryInformationJobObject(j->job.value, JobObjectBasicAccountingInformation, &a, sizeof(a), nullptr), "LEARNING_QUERY"); return a;
}
static bool safeToRelease(Job* j) {
  if (!j->outEof || !j->errEof || !members(j).empty() || accounting(j).ActiveProcesses) return false;
  for (const auto& p : j->retained) if (!signaled(p->handle.value)) return false;
  return true; // Historical accounting mismatch is not evidence of a live process.
}
static napi_value start(napi_env e, napi_callback_info i) {
  auto j = std::make_unique<Job>();
  try {
    const auto a = args(e, i, 5); const auto exe = wide(e, a[0]), cwd = wide(e, a[2]);
    require(absolute(exe) && absolute(cwd), "LEARNING_ARGUMENT");
    uint32_t n = 0; js(napi_get_array_length(e, a[1], &n)); require(n <= 1024, "LEARNING_ARGUMENT");
    std::wstring command = quote(exe);
    for (uint32_t k = 0; k < n; ++k) { napi_value v; js(napi_get_element(e, a[1], k, &v)); command += L" " + quote(wide(e, v)); }
    require(command.size() < 32767, "LEARNING_ARGUMENT");
    double quota = 0; js(napi_get_value_double(e, a[3], &quota));
    require(std::isfinite(quota) && std::floor(quota) == quota && quota >= 16 * 1024 * 1024 && quota <= 2.0 * 1024 * 1024 * 1024, "LEARNING_ARGUMENT");
    js(napi_get_array_length(e, a[4], &n)); require(n <= 4096, "LEARNING_ARGUMENT");
    std::wstring environment;
    for (uint32_t k = 0; k < n; ++k) { napi_value v; js(napi_get_element(e, a[4], k, &v)); auto entry = wide(e, v);
      require(entry.find(L'=') > 0 && entry.find(L'=') != std::wstring::npos, "LEARNING_ARGUMENT"); environment += entry; environment += L'\0'; }
    environment += L'\0'; if (!n) environment += L'\0'; require(environment.size() <= 32767, "LEARNING_ARGUMENT");
    j->job.value = CreateJobObjectW(nullptr, nullptr); require(j->job.value != nullptr, "LEARNING_CREATE");
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limit{};
    limit.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_JOB_MEMORY;
    limit.JobMemoryLimit = static_cast<SIZE_T>(quota);
    require(SetInformationJobObject(j->job.value, JobObjectExtendedLimitInformation, &limit, sizeof(limit)), "LEARNING_QUOTA");
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION actual{};
    require(QueryInformationJobObject(j->job.value, JobObjectExtendedLimitInformation, &actual, sizeof(actual), nullptr), "LEARNING_QUOTA");
    require(actual.JobMemoryLimit == limit.JobMemoryLimit && (actual.BasicLimitInformation.LimitFlags & limit.BasicLimitInformation.LimitFlags) == limit.BasicLimitInformation.LimitFlags, "LEARNING_QUOTA");
    j->quota = actual.JobMemoryLimit;
    j->port.value = CreateIoCompletionPort(INVALID_HANDLE_VALUE, nullptr, 0, 1); require(j->port.value != nullptr, "LEARNING_CREATE");
    JOBOBJECT_ASSOCIATE_COMPLETION_PORT port{}; port.CompletionKey = j.get(); port.CompletionPort = j->port.value;
    require(SetInformationJobObject(j->job.value, JobObjectAssociateCompletionPortInformation, &port, sizeof(port)), "LEARNING_CREATE");
    Handle outWrite, errWrite, input; SECURITY_ATTRIBUTES sa{sizeof(sa), nullptr, TRUE};
    require(CreatePipe(&j->out.value, &outWrite.value, &sa, 0), "LEARNING_PIPE");
    require(CreatePipe(&j->err.value, &errWrite.value, &sa, 0), "LEARNING_PIPE");
    require(SetHandleInformation(j->out.value, HANDLE_FLAG_INHERIT, 0) && SetHandleInformation(j->err.value, HANDLE_FLAG_INHERIT, 0), "LEARNING_PIPE");
    input.value = CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, OPEN_EXISTING, 0, nullptr);
    require(input.value != INVALID_HANDLE_VALUE, "LEARNING_PIPE");
    SIZE_T size = 0; InitializeProcThreadAttributeList(nullptr, 2, 0, &size); std::vector<unsigned char> bytes(size);
    auto attributes = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(bytes.data());
    require(InitializeProcThreadAttributeList(attributes, 2, 0, &size), "LEARNING_CREATE");
    struct Guard { LPPROC_THREAD_ATTRIBUTE_LIST p; ~Guard() { DeleteProcThreadAttributeList(p); } } guard{attributes};
    require(UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, &j->job.value, sizeof(HANDLE), nullptr, nullptr), "LEARNING_CREATE");
    HANDLE inherit[] = { input.value, outWrite.value, errWrite.value };
    require(UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, inherit, sizeof(inherit), nullptr, nullptr), "LEARNING_CREATE");
    STARTUPINFOEXW si{}; si.StartupInfo.cb = sizeof(si); si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    si.StartupInfo.hStdInput = input.value; si.StartupInfo.hStdOutput = outWrite.value; si.StartupInfo.hStdError = errWrite.value; si.lpAttributeList = attributes;
    PROCESS_INFORMATION pi{};
    require(CreateProcessW(exe.c_str(), command.data(), nullptr, nullptr, TRUE,
      CREATE_NO_WINDOW | CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT,
      environment.data(), cwd.c_str(), &si.StartupInfo, &pi), "LEARNING_SPAWN");
    auto root = std::make_unique<Process>(); root->handle.value = pi.hProcess; root->pid = pi.dwProcessId; j->rootThread.value = pi.hThread;
    j->rootPid = root->pid; BOOL member = FALSE;
    require(IsProcessInJob(root->handle.value, j->job.value, &member) && member, "LEARNING_OWNERSHIP");
    root->created = creation(root->handle.value); j->retained.push_back(std::move(root));
    outWrite.close(); errWrite.close(); input.close();
    // External owner and every native resource exist BEFORE untrusted code resumes.
    napi_value external; auto ptr = j.get(); jobs.insert(ptr);
    try { js(napi_create_external(e, ptr, [](napi_env, void* p, void*) { auto value = static_cast<Job*>(p); jobs.erase(value); delete value; }, nullptr, &external)); }
    catch (...) { jobs.erase(ptr); throw; }
    // Return ownership while STILL suspended. Main stores the external before
    // resume, so resume failure remains retryable through the same owned Job.
    j.release();
    return external;
  } catch (const std::exception& ex) { return error(e, ex); }
}
static napi_value readPipe(napi_env e, Handle& pipe, bool& eof) {
  DWORD available = 0, count = 0;
  if (!eof && !PeekNamedPipe(pipe.value, nullptr, 0, nullptr, &available, nullptr)) {
    require(GetLastError() == ERROR_BROKEN_PIPE, "LEARNING_PIPE"); eof = true;
  }
  std::vector<char> bytes(std::min<DWORD>(available, 65536));
  if (!bytes.empty()) require(ReadFile(pipe.value, bytes.data(), static_cast<DWORD>(bytes.size()), &count, nullptr), "LEARNING_PIPE");
  napi_value v; js(napi_create_buffer_copy(e, count, count ? bytes.data() : nullptr, nullptr, &v)); return v;
}
static napi_value poll(napi_env e, napi_callback_info i) {
  try {
    auto a = args(e, i, 1); auto j = owned(e, a[0]); require(!j->released, "LEARNING_OWNERSHIP");
    auto list = members(j); for (DWORD pid : list) capture(j, pid);
    auto v = object(e); napi_value array; js(napi_create_array(e, &array));
    for (uint32_t n = 0; n < j->retained.size(); ++n) { const auto& p = j->retained[n]; auto id = identity(e, p->handle.value);
      require(p->pid == GetProcessId(p->handle.value) && p->created == creation(p->handle.value), "LEARNING_IDENTITY"); js(napi_set_element(e, array, n, id)); }
    prop(e, v, "retained", array); js(napi_create_array(e, &array));
    for (uint32_t n = 0; n < list.size(); ++n) { napi_value pid; js(napi_create_uint32(e, list[n], &pid)); js(napi_set_element(e, array, n, pid)); }
    prop(e, v, "members", array);
    auto acc = accounting(j); number(e, v, "activeProcesses", acc.ActiveProcesses); number(e, v, "totalProcesses", acc.TotalProcesses);
    prop(e, v, "stdout", readPipe(e, j->out, j->outEof)); prop(e, v, "stderr", readPipe(e, j->err, j->errEof));
    boolean(e, v, "observerSettled", j->outEof && j->errEof && signaled(j->retained[0]->handle.value));
    boolean(e, v, "coverageComplete", !j->gap); number(e, v, "rootPid", j->rootPid);
    DWORD exit = STILL_ACTIVE; require(GetExitCodeProcess(j->retained[0]->handle.value, &exit), "LEARNING_QUERY"); number(e, v, "exitCode", exit);
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limit{};
    require(QueryInformationJobObject(j->job.value, JobObjectExtendedLimitInformation, &limit, sizeof(limit), nullptr), "LEARNING_QUERY");
    number(e, v, "quotaBytes", static_cast<double>(limit.JobMemoryLimit)); number(e, v, "peakJobCommitBytes", static_cast<double>(limit.PeakJobMemoryUsed));
    JOBOBJECT_LIMIT_VIOLATION_INFORMATION violation{};
    require(QueryInformationJobObject(j->job.value, JobObjectLimitViolationInformation, &violation, sizeof(violation), nullptr), "LEARNING_QUERY");
    number(e, v, "reportedJobCommitBytes", static_cast<double>(violation.JobMemory));
    js(napi_create_array(e, &array)); uint32_t index = 0;
    for (; index < 4096; ++index) {
      DWORD message = 0; ULONG_PTR key = 0; LPOVERLAPPED pid = nullptr;
      if (!GetQueuedCompletionStatus(j->port.value, &message, &key, &pid, 0)) { require(GetLastError() == WAIT_TIMEOUT, "LEARNING_QUERY"); break; }
      require(key == reinterpret_cast<ULONG_PTR>(j), "LEARNING_OWNERSHIP"); auto event = object(e);
      number(e, event, "message", message); number(e, event, "pid", static_cast<double>(reinterpret_cast<ULONG_PTR>(pid)));
      js(napi_set_element(e, array, index, event));
    }
    require(index < 4096, "LEARNING_QUERY"); prop(e, v, "events", array); return v;
  } catch (const std::exception& ex) { return error(e, ex); }
}
static napi_value control(napi_env e, napi_callback_info i) {
  try {
    auto a = args(e, i, 2); auto j = owned(e, a[0]); const auto op = wide(e, a[1]);
    if (op == L"resume") {
      require(!j->released && !j->terminated, "LEARNING_OWNERSHIP");
      if (!j->resumed) { require(ResumeThread(j->rootThread.value) != DWORD(-1), "LEARNING_SPAWN"); j->resumed = true; }
    } else if (op == L"terminate") {
      require(!j->released, "LEARNING_OWNERSHIP");
      if (!j->terminated) { require(TerminateJobObject(j->job.value, 1), "LEARNING_TERMINATE"); j->terminated = true; }
    } else if (op == L"release") {
      if (!j->released) { require(safeToRelease(j), "LEARNING_NOT_READY"); j->job.close(); j->released = true; }
    } else if (op == L"closeHandles") {
      require(j->released, "LEARNING_NOT_READY");
      if (!j->handlesClosed) {
        j->out.close(); j->err.close(); j->port.close(); j->rootThread.close();
        for (auto& p : j->retained) p->handle.close();
        j->handlesClosed = true;
      }
    } else throw Failure("LEARNING_ARGUMENT", 0);
    return undef(e);
  } catch (const std::exception& ex) { return error(e, ex); }
}
static napi_value externalHandle(napi_env e, std::unique_ptr<Observation> h) {
  napi_value v; auto ptr = h.get(); observations.insert(ptr);
  try { js(napi_create_external(e, ptr, [](napi_env, void* p, void*) { auto value = static_cast<Observation*>(p); observations.erase(value); delete value; }, nullptr, &v)); }
  catch (...) { observations.erase(ptr); throw; }
  h.release(); return v;
}
static napi_value state(napi_env e, napi_callback_info i) {
  try {
    auto a = args(e, i, 1); auto j = owned(e, a[0]); auto v = object(e);
    boolean(e, v, "terminated", j->terminated); boolean(e, v, "released", j->released);
    boolean(e, v, "handlesClosed", j->handlesClosed); return v;
  } catch (const std::exception& ex) { return error(e, ex); }
}
static napi_value acquireLease(napi_env e, napi_callback_info i) {
  try {
    auto a = args(e, i, 1); const auto path = wide(e, a[0]); require(absolute(path), "LEARNING_ARGUMENT");
    auto h = std::make_unique<Observation>(); h->lease = true;
    h->handle.value = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_ALWAYS,
      FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (h->handle.value == INVALID_HANDLE_VALUE) {
      h->handle.value = nullptr;
      if (GetLastError() == ERROR_SHARING_VIOLATION) { napi_value v; js(napi_get_null(e, &v)); return v; }
      throw Failure("LEARNING_LEASE", GetLastError());
    }
    BY_HANDLE_FILE_INFORMATION file{}; require(GetFileInformationByHandle(h->handle.value, &file), "LEARNING_LEASE");
    require(!(file.dwFileAttributes & (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DIRECTORY)), "LEARNING_LEASE");
    return externalHandle(e, std::move(h));
  } catch (const std::exception& ex) { return error(e, ex); }
}
static napi_value watch(napi_env e, napi_callback_info i) {
  try {
    auto a = args(e, i, 1); uint32_t pid; js(napi_get_value_uint32(e, a[0], &pid)); require(pid != 0, "LEARNING_ARGUMENT");
    auto h = std::make_unique<Observation>(); h->handle.value = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    require(h->handle.value != nullptr, "LEARNING_IDENTITY"); return externalHandle(e, std::move(h));
  } catch (const std::exception& ex) { return error(e, ex); }
}
static napi_value observation(napi_env e, napi_callback_info i) {
  try {
    auto a = args(e, i, 2); auto h = observed(e, a[0]); const auto op = wide(e, a[1]);
    if (op == L"close") { h->handle.close(); return undef(e); }
    require(!h->lease && h->handle.value, "LEARNING_OWNERSHIP"); return identity(e, h->handle.value);
  } catch (const std::exception& ex) { return error(e, ex); }
}
static napi_value init(napi_env e, napi_value exports) {
  napi_property_descriptor methods[] = {
    {"start", nullptr, start, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"poll", nullptr, poll, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"control", nullptr, control, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"state", nullptr, state, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"acquireLease", nullptr, acquireLease, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"watch", nullptr, watch, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"observation", nullptr, observation, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  js(napi_define_properties(e, exports, 7, methods)); prop(e, exports, "capability", text(e, "student-ide-learning-job-v1")); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
