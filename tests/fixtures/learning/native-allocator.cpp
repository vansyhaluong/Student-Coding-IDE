#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <vector>
// Test-only bounded allocator: at most 96 MiB, no production quota override.
int main() {
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
  std::printf("ALLOCATOR_READY %lu\n", GetCurrentProcessId()); std::fflush(stdout);
  std::vector<void*> blocks;
  for (size_t bytes = 0; bytes < 96ull * 1024 * 1024; bytes += 1024 * 1024) {
    void* p = VirtualAlloc(nullptr, 1024 * 1024, MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
    if (!p) {
      const DWORD error = GetLastError(); std::printf("ALLOC_DENIED %zu %lu\n", bytes, error); std::fflush(stdout);
      WaitForSingleObject(GetCurrentProcess(), INFINITE); return 0;
    }
    blocks.push_back(p); std::memset(p, 0x5a, 1024 * 1024);
  }
  std::printf("ALLOC_CEILING\n"); std::fflush(stdout);
  WaitForSingleObject(GetCurrentProcess(), INFINITE); return 2;
}
