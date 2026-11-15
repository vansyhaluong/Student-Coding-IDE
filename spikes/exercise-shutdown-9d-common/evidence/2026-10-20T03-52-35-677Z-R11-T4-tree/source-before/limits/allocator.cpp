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
    STARTUPINFOW si{}; si.cb = sizeof(si); PROCESS_INFORMATION pi{};
    if (!CreateProcessW(exe, command.data(), nullptr, nullptr, TRUE, CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi)) return 6;
    std::printf("ALLOC_CHILD %lu\n", pi.dwProcessId); std::fflush(stdout);
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    WaitForSingleObject(GetCurrentProcess(), INFINITE);
  }
  if (std::wstring(argv[3]) == L"hold") WaitForSingleObject(GetCurrentProcess(), INFINITE);
  for (void* p : blocks) VirtualFree(p, 0, MEM_RELEASE);
  return 0;
}
