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
