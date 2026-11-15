#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <string>
// Cooperative native fixture: bounded commit, explicit go handshake, no sleep.
int wmain(int argc, wchar_t** argv) {
  if (argc != 4) return 2;
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
  const size_t ceiling = static_cast<size_t>(_wtoi(argv[2])) * 1024 * 1024;
  if (ceiling == 0 || ceiling > 384ull * 1024 * 1024) return 3;
  std::printf("ALLOCATOR_READY %lu\n", GetCurrentProcessId()); std::fflush(stdout);
  // Harness signals an owned named event, not a timing delay.
  HANDLE event = OpenEventW(SYNCHRONIZE, FALSE, argv[1]);
  if (!event || WaitForSingleObject(event, 10000) != WAIT_OBJECT_0) return 4;
  CloseHandle(event);
  std::vector<void*> blocks;
  for (size_t bytes = 0; bytes < ceiling; bytes += 1024 * 1024) {
    void* p = VirtualAlloc(nullptr, 1024 * 1024, MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
    if (!p) { const DWORD error = GetLastError(); std::printf("ALLOC_DENIED %zu %lu\n", bytes, error); std::fflush(stdout); WaitForSingleObject(GetCurrentProcess(), INFINITE); return 0; }
    blocks.push_back(p); std::memset(p, 0x5a, 1024 * 1024);
  }
  std::printf("ALLOC_CEILING %zu\n", ceiling); std::fflush(stdout);
  if (std::wstring(argv[3]) == L"tree") {
    wchar_t exe[32768]; if (!GetModuleFileNameW(nullptr, exe, 32768)) return 5;
    std::wstring command = L"\"" + std::wstring(exe) + L"\" \"" + argv[1] + L"\" 96 hold";
    // Explicitly redirect only these three inherited duplicates. The child must
    // report its flushed markers through the same monitored pipe as the root.
    HANDLE standard[3]{};
    const DWORD selectors[3] = {STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE};
    for (size_t i = 0; i < 3; ++i) {
      if (!DuplicateHandle(GetCurrentProcess(), GetStdHandle(selectors[i]), GetCurrentProcess(), &standard[i], 0, TRUE, DUPLICATE_SAME_ACCESS)) {
        for (HANDLE h : standard) if (h) CloseHandle(h);
        return 7;
      }
    }
    SIZE_T attributeBytes = 0; InitializeProcThreadAttributeList(nullptr, 1, 0, &attributeBytes);
    std::vector<unsigned char> storage(attributeBytes);
    auto attributes = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
    if (!InitializeProcThreadAttributeList(attributes, 1, 0, &attributeBytes)) {
      for (HANDLE h : standard) CloseHandle(h);
      return 8;
    }
    STARTUPINFOEXW si{}; si.StartupInfo.cb = sizeof(si);
    si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    si.StartupInfo.hStdInput = standard[0]; si.StartupInfo.hStdOutput = standard[1]; si.StartupInfo.hStdError = standard[2];
    si.lpAttributeList = attributes;
    const BOOL listed = UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, standard, sizeof(standard), nullptr, nullptr);
    PROCESS_INFORMATION pi{};
    const BOOL created = listed && CreateProcessW(exe, command.data(), nullptr, nullptr, TRUE,
      CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT, nullptr, nullptr, &si.StartupInfo, &pi);
    DeleteProcThreadAttributeList(attributes);
    for (HANDLE h : standard) CloseHandle(h);
    if (!created) return 6;
    std::printf("ALLOC_CHILD %lu\n", pi.dwProcessId); std::fflush(stdout);
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    WaitForSingleObject(GetCurrentProcess(), INFINITE);
  }
  if (std::wstring(argv[3]) == L"hold") WaitForSingleObject(GetCurrentProcess(), INFINITE);
  for (void* p : blocks) VirtualFree(p, 0, MEM_RELEASE);
  return 0;
}
