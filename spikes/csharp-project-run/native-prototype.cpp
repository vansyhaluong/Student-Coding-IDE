// Isolated evidence module. Compile the existing pipe/Job primitives into a
// separate binary; no production exports, sessions or source files are modified.
#include <node_api.h>
static napi_value probeInit(napi_env env, napi_value exports);
#undef NAPI_MODULE
#define NAPI_MODULE(name, function) NAPI_MODULE_INIT() { return probeInit(env, exports); }
#include "../../src/main/services/run/native/run-process.cpp"
#include <tlhelp32.h>

static void number(napi_env env, napi_value object, const char* key, double value) {
  napi_value result; napiCheck(napi_create_double(env, value, &result));
  napiCheck(napi_set_named_property(env, object, key, result));
}
static napi_value inspect(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1; napi_value argv[1];
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    Session* s = nullptr;
    if (argc) napiCheck(napi_get_value_external(env, argv[0], reinterpret_cast<void**>(&s)));
    napi_value result, processes; napiCheck(napi_create_object(env, &result));
    napiCheck(napi_create_array(env, &processes));
    DWORD handles = 0; check(GetProcessHandleCount(GetCurrentProcess(), &handles), "Handle count failed");
    number(env, result, "handles", handles);
    if (s) {
      number(env, result, "active", s->released ? 0 : active(s));
      number(env, result, "pendingWrites", s->pendingWrites);
      number(env, result, "released", s->released);
      number(env, result, "drained", s->drained);
      number(env, result, "openSessionHandles", !!s->job.value + !!s->root.value
        + !!s->out.value + !!s->err.value + !!s->inputWrite.value);
    }
    Handle snapshot; snapshot.value = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    check(snapshot.value != INVALID_HANDLE_VALUE, "Process snapshot failed");
    PROCESSENTRY32W entry{}; entry.dwSize = sizeof(entry); uint32_t index = 0;
    for (BOOL found = Process32FirstW(snapshot.value, &entry); found; found = Process32NextW(snapshot.value, &entry)) {
      Handle process; process.value = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, entry.th32ProcessID);
      BOOL owned = FALSE;
      if (process.value && s && !s->released) IsProcessInJob(process.value, s->job.value, &owned);
      const std::wstring name(entry.szExeFile);
      if (!owned && _wcsicmp(name.c_str(), L"dotnet.exe") && _wcsicmp(name.c_str(), L"MSBuild.exe")
        && _wcsicmp(name.c_str(), L"VBCSCompiler.exe") && _wcsicmp(name.c_str(), L"GateApp.exe")) continue;
      napi_value item, label; napiCheck(napi_create_object(env, &item));
      number(env, item, "pid", entry.th32ProcessID); number(env, item, "parent", entry.th32ParentProcessID);
      number(env, item, "owned", owned);
      FILETIME created{}, exited{}, kernel{}, user{};
      if (process.value && GetProcessTimes(process.value, &created, &exited, &kernel, &user)) {
        number(env, item, "created", double((ULONGLONG(created.dwHighDateTime) << 32) | created.dwLowDateTime));
      }
      napiCheck(napi_create_string_utf16(env, reinterpret_cast<const char16_t*>(name.data()), name.size(), &label));
      napiCheck(napi_set_named_property(env, item, "name", label));
      napiCheck(napi_set_element(env, processes, index++, item));
    }
    napiCheck(napi_set_named_property(env, result, "processes", processes));
    return result;
  } catch (const std::exception& error) { napi_throw_error(env, nullptr, error.what()); return nullptr; }
}
static napi_value probeControl(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 2; napi_value argv[2];
    napiCheck(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
    check(argc == 2, "Expected owned probe session and operation");
    Session* s; napiCheck(napi_get_value_external(env, argv[0], reinterpret_cast<void**>(&s)));
    const auto operation = string(env, argv[1]);
    check(!s->released, "Probe session released");
    if (operation == L"eof") { check(s->pendingWrites == 0, "Write pending"); s->inputWrite.close(); }
    else if (operation == L"root-stop") check(TerminateProcess(s->root.value, 91), "Root stop failed");
    else throw std::runtime_error("Unknown probe operation");
    napi_value result; napi_get_undefined(env, &result); return result;
  } catch (const std::exception& error) { napi_throw_error(env, nullptr, error.what()); return nullptr; }
}
static napi_value probeInit(napi_env env, napi_value exports) {
  init(env, exports);
  // Mode 2 selects the existing writable-pipe primitive, not an LSP manager,
  // protocol, session or process factory. All probe sessions are independently owned.
  static int pipeMode = 2;
  napi_property_descriptor methods[] = {
    {"createProbe", nullptr, create, nullptr, nullptr, nullptr, napi_default, &pipeMode},
    {"writeProbe", nullptr, writeCsharp, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"inspect", nullptr, inspect, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"probeControl", nullptr, probeControl, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napiCheck(napi_define_properties(env, exports, 4, methods));
  return exports;
}
