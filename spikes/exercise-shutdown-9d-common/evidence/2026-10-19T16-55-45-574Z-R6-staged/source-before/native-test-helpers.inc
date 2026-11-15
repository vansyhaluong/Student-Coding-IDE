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
  };
  napi_define_properties(env, exports, 11, helpers);
}
