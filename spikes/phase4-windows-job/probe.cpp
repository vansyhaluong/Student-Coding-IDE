// Standalone feasibility only. No Electron, IPC, production, or third-party code.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <algorithm>
#include <iostream>
#include <string>
#include <vector>
#include <stdexcept>
#include <sstream>

static void require(bool ok, const char* what) {
  if (!ok) throw std::runtime_error(std::string(what) + " win32=" + std::to_string(GetLastError()));
}
struct Handle {
  HANDLE h = nullptr;
  ~Handle() { if (h && h != INVALID_HANDLE_VALUE) CloseHandle(h); }
  Handle() = default;
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
  void close() { if (h) { require(CloseHandle(h) != 0, "CloseHandle"); h = nullptr; } }
};
static DWORD active(HANDLE job) {
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info{};
  require(QueryInformationJobObject(job, JobObjectBasicAccountingInformation,
    &info, sizeof(info), nullptr) != 0, "Query job");
  return info.ActiveProcesses;
}
static void empty(HANDLE job) {
  const auto deadline = GetTickCount64() + 5000;
  while (active(job) != 0) {
    require(GetTickCount64() < deadline, "Job empty deadline");
    Sleep(5); // Poll OS accounting; completion is condition-driven, not elapsed-time success.
  }
}
struct Session {
  Handle job, root, outRead, outWrite, errRead, errWrite, input;
  bool released = false;
  ~Session() {
    // Emergency cleanup is scoped exclusively to the Job created by this probe.
    if (job.h && !released) {
      TerminateJobObject(job.h, 99);
      try { empty(job.h); } catch (...) { std::cerr << "EMERGENCY CLEANUP FAILED\n"; }
    }
  }
};
static std::wstring quote(const std::wstring& s) {
  // Inputs are fixed executable/fixture paths and fixed mode; reject embedded quotes.
  require(s.find(L'"') == std::wstring::npos, "Unsupported quote in probe path");
  return L"\"" + s + L"\"";
}
static void create(Session& s, const std::wstring& node, const std::wstring& fixture,
                   const std::wstring& cwd, const std::wstring& mode) {
  SECURITY_ATTRIBUTES sa{sizeof(sa), nullptr, TRUE};
  require(CreatePipe(&s.outRead.h, &s.outWrite.h, &sa, 0) != 0, "stdout pipe");
  require(CreatePipe(&s.errRead.h, &s.errWrite.h, &sa, 0) != 0, "stderr pipe");
  require(SetHandleInformation(s.outRead.h, HANDLE_FLAG_INHERIT, 0) != 0, "stdout noninherit");
  require(SetHandleInformation(s.errRead.h, HANDLE_FLAG_INHERIT, 0) != 0, "stderr noninherit");
  s.input.h = CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
    &sa, OPEN_EXISTING, 0, nullptr);
  require(s.input.h != INVALID_HANDLE_VALUE, "NUL stdin");
  s.job.h = CreateJobObjectW(nullptr, nullptr);
  require(s.job.h != nullptr, "CreateJobObjectW");
  // Default Job flags: no breakaway and no KILL_ON_JOB_CLOSE.
  SIZE_T size = 0;
  InitializeProcThreadAttributeList(nullptr, 2, 0, &size);
  std::vector<unsigned char> bytes(size);
  auto attributes = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(bytes.data());
  require(InitializeProcThreadAttributeList(attributes, 2, 0, &size) != 0, "Init attributes");
  struct AttributesGuard {
    LPPROC_THREAD_ATTRIBUTE_LIST value;
    ~AttributesGuard() { DeleteProcThreadAttributeList(value); }
  } guard{attributes};
  require(UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST,
    &s.job.h, sizeof(HANDLE), nullptr, nullptr) != 0, "Creation Job list");
  HANDLE inherited[] = {s.input.h, s.outWrite.h, s.errWrite.h};
  require(UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
    inherited, sizeof(inherited), nullptr, nullptr) != 0, "Explicit handle list");
  STARTUPINFOEXW startup{};
  startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = s.input.h;
  startup.StartupInfo.hStdOutput = s.outWrite.h;
  startup.StartupInfo.hStdError = s.errWrite.h;
  startup.lpAttributeList = attributes;
  PROCESS_INFORMATION process{};
  auto command = quote(node) + L" " + quote(fixture) + L" " + mode;
  require(CreateProcessW(node.c_str(), command.data(), nullptr, nullptr, TRUE,
    EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW, nullptr, cwd.c_str(),
    &startup.StartupInfo, &process) != 0, "CreateProcessW");
  s.root.h = process.hProcess;
  Handle thread;
  thread.h = process.hThread;
  BOOL owned = FALSE;
  require(IsProcessInJob(s.root.h, s.job.h, &owned) != 0 && owned, "Root Job membership");
  s.outWrite.close(); s.errWrite.close(); s.input.close();
}
static bool drain(HANDLE pipe, std::string& text) {
  DWORD available = 0;
  if (!PeekNamedPipe(pipe, nullptr, 0, nullptr, &available, nullptr)) {
    require(GetLastError() == ERROR_BROKEN_PIPE, "Peek pipe");
    return true;
  }
  if (available) {
    char buffer[4096]; DWORD count = 0;
    require(ReadFile(pipe, buffer, std::min(available, DWORD(sizeof(buffer))), &count, nullptr) != 0, "Read pipe");
    text.append(buffer, count);
    require(text.size() < 65536, "Bounded fixture output");
  }
  return false;
}
template<class Condition> static void until(Session& s, std::string& out,
                                           std::string& err, Condition done) {
  const auto deadline = GetTickCount64() + 5000;
  for (;;) {
    bool outClosed = drain(s.outRead.h, out);
    bool errClosed = drain(s.errRead.h, err);
    if (done(outClosed, errClosed)) return;
    if (GetTickCount64() >= deadline) {
      std::cerr << "fixture stdout=" << out << " stderr=" << err << "\n";
      require(false, "Fixture event deadline");
    }
    Sleep(5);
  }
}
static void experiment(const std::wstring& node, const std::wstring& fixture,
                       const std::wstring& cwd, const std::wstring& mode) {
  Session s;
  create(s, node, fixture, cwd, mode);
  std::string out, err;
  std::vector<HANDLE> descendants;
  struct DescendantGuard {
    std::vector<HANDLE>& handles;
    ~DescendantGuard() { for (auto h : handles) CloseHandle(h); }
  } guard{descendants};
  if (mode == L"basic") {
    until(s, out, err, [&](bool a, bool b) {
      return a && b && WaitForSingleObject(s.root.h, 0) == WAIT_OBJECT_0;
    });
    DWORD code;
    require(GetExitCodeProcess(s.root.h, &code) && code == 0, "Basic exit 0");
    require(out == "stdout-test\n" && err == "stderr-test\n", "Separate exact streams");
  } else {
    until(s, out, err, [&](bool, bool) { return out.find("READY\n") != std::string::npos; });
    std::istringstream lines(out); std::string line;
    while (std::getline(lines, line)) if (line.rfind("PID:", 0) == 0) {
      auto pid = static_cast<DWORD>(std::stoul(line.substr(4)));
      HANDLE h = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
      require(h != nullptr, "Open controlled descendant");
      descendants.push_back(h);
      BOOL owned = FALSE;
      require(IsProcessInJob(h, s.job.h, &owned) && owned, "Descendant membership");
    }
    require(descendants.size() == (mode == L"long" ? 0u : 2u), "Expected descendant count");
    if (mode == L"root-first") {
      require(WaitForSingleObject(s.root.h, 5000) == WAIT_OBJECT_0, "Root exits first");
      DWORD code;
      require(GetExitCodeProcess(s.root.h, &code) && code == 0, "Root-first exit 0");
      require(active(s.job.h) >= 2, "Descendants retained after root exit");
      for (auto h : descendants)
        require(WaitForSingleObject(h, 0) == WAIT_TIMEOUT, "Descendant still alive");
    } else {
      require(WaitForSingleObject(s.root.h, 0) == WAIT_TIMEOUT, "Root live before Stop");
    }
    // Retained handles prove every expected Node's membership and lifetime.
    // Windows may also add/remove conhost while root exit is being observed;
    // reopening its transient PID is not a reliable lifecycle assertion.
    // All Job members (including conhost) must still reach zero below.
    require(active(s.job.h) >= (mode == L"long" ? 1u : mode == L"tree" ? 3u : 2u),
      "Job contains all expected live Nodes");
    require(TerminateJobObject(s.job.h, 37) != 0, "Stop entire Job");
  }
  empty(s.job.h);
  require(WaitForSingleObject(s.root.h, 5000) == WAIT_OBJECT_0, "Root terminated");
  for (auto h : descendants)
    require(WaitForSingleObject(h, 5000) == WAIT_OBJECT_0, "Descendant terminated");
  until(s, out, err, [](bool a, bool b) { return a && b; });
  s.job.close(); s.released = true;
}
int wmain(int argc, wchar_t** argv) {
  try {
    require(argc == 4, "Usage probe node fixture cwd");
    DWORD baseline = 0, after = 0;
    // Warm the CRT and process APIs before measuring stable handle counts.
    experiment(argv[1], argv[2], argv[3], L"basic");
    std::cout << "warmup PASS\n";
    require(GetProcessHandleCount(GetCurrentProcess(), &baseline) != 0, "Baseline handles");
    for (const auto mode : {L"basic", L"long", L"tree", L"root-first"}) {
      experiment(argv[1], argv[2], argv[3], mode);
      require(GetProcessHandleCount(GetCurrentProcess(), &after) && after == baseline, "Experiment handle leak");
      std::wcout << mode << L" PASS handles=" << after << L"\n";
    }
    for (int i = 0; i < 30; ++i) {
      experiment(argv[1], argv[2], argv[3], i % 2 ? L"tree" : L"root-first");
      require(GetProcessHandleCount(GetCurrentProcess(), &after) && after == baseline, "Repeated handle leak");
    }
    std::cout << "repeat=30 PASS baseline=" << baseline << " final=" << after
              << " whole-tree-empty/process-handles-signaled/pipe-EOF PASS\n";
    return 0;
  } catch (const std::exception& e) {
    std::cerr << "FAIL " << e.what() << "\n";
    return 1;
  }
}
