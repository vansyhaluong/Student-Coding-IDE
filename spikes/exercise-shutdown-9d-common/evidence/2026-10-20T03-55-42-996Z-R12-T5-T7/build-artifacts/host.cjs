"use strict";
const electron = require("electron");
const assert = require("node:assert/strict");
const node_module = require("node:module");
const promises = require("node:fs/promises");
const node_fs = require("node:fs");
const node_path = require("node:path");
const node_perf_hooks = require("node:perf_hooks");
const node_crypto = require("node:crypto");
const node_string_decoder = require("node:string_decoder");
const node_child_process = require("node:child_process");
const posix = require("node:path/posix");
const win32 = require("node:path/win32");
const node_async_hooks = require("node:async_hooks");
const nodePty = require("node-pty");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const nodePty__namespace = /* @__PURE__ */ _interopNamespaceDefault(nodePty);
class ProcessManager {
  name = "ProcessManager";
  resources = /* @__PURE__ */ new Map();
  cleanupTasks = /* @__PURE__ */ new Map();
  register(resource) {
    if (this.resources.has(resource.id)) {
      throw new Error(`Owned resource already registered: ${resource.id}`);
    }
    this.resources.set(resource.id, resource);
    return () => {
      if (!this.cleanupTasks.has(resource.id) && this.resources.get(resource.id) === resource) {
        this.resources.delete(resource.id);
      }
    };
  }
  async cleanupOwner(ownerId) {
    const owned = [...this.resources.values()].filter((resource) => resource.ownerId === ownerId);
    await this.cleanup(owned);
  }
  async stop() {
    await this.cleanup([...this.resources.values()]);
  }
  get size() {
    return this.resources.size;
  }
  async cleanup(resources) {
    const errors = [];
    for (const resource of resources.reverse()) {
      try {
        await this.cleanupResource(resource);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Owned resource cleanup failed");
    }
  }
  cleanupResource(resource) {
    if (this.resources.get(resource.id) !== resource) {
      return Promise.resolve();
    }
    const existingTask = this.cleanupTasks.get(resource.id);
    if (existingTask) return existingTask;
    const task = Promise.resolve().then(() => resource.close()).then(() => {
      if (this.resources.get(resource.id) === resource) {
        this.resources.delete(resource.id);
      }
    });
    this.cleanupTasks.set(resource.id, task);
    void task.finally(() => {
      if (this.cleanupTasks.get(resource.id) === task) {
        this.cleanupTasks.delete(resource.id);
      }
    }).catch(() => void 0);
    return task;
  }
}
const NODE_ERROR_CODES = {
  ENOENT: "NOT_FOUND",
  EACCES: "PERMISSION_DENIED",
  EPERM: "PERMISSION_DENIED",
  EBUSY: "PERMISSION_DENIED",
  EEXIST: "INVALID_INPUT",
  ENOTDIR: "INVALID_INPUT",
  EISDIR: "INVALID_INPUT",
  EINVAL: "INVALID_INPUT"
};
class DomainError extends Error {
  code;
  operation;
  details;
  retryable;
  constructor(error, options) {
    super(error.message, options);
    this.name = "DomainError";
    this.code = error.code;
    this.operation = error.operation;
    this.details = error.details;
    this.retryable = error.retryable;
  }
}
function invalidInputError(operation, fields) {
  return new DomainError({
    code: "INVALID_INPUT",
    message: "The request payload is invalid.",
    operation,
    details: fields.length > 0 ? { fields: fields.join(", ") } : void 0,
    retryable: false
  });
}
function serializeAppError(error, fallbackOperation) {
  if (error instanceof DomainError) {
    return {
      code: error.code,
      message: error.message,
      operation: error.operation ?? fallbackOperation,
      details: error.details,
      retryable: error.retryable
    };
  }
  if (isNodeError(error)) {
    const code = NODE_ERROR_CODES[error.code ?? ""] ?? "INTERNAL_ERROR";
    return {
      code,
      message: safeNodeMessage(code),
      operation: fallbackOperation,
      retryable: code === "INTERNAL_ERROR"
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "An internal application error occurred.",
    operation: fallbackOperation,
    retryable: false
  };
}
function isNodeError(error) {
  return error instanceof Error && ("code" in error || "errno" in error);
}
function safeNodeMessage(code) {
  switch (code) {
    case "NOT_FOUND":
      return "The requested resource was not found.";
    case "PERMISSION_DENIED":
      return "Permission was denied for this operation.";
    case "INVALID_INPUT":
      return "The operation received invalid input.";
    default:
      return "An internal application error occurred.";
  }
}
const MAXIMUM_WINDOWS_PID = 4294967295;
const DEFAULT_TIMEOUT_MILLISECONDS = 5e3;
const MAXIMUM_OUTPUT_BYTES = 16 * 1024;
const ABSENT_IDENTITY = "PROCESS_ABSENT";
const IDENTITY_SCRIPT = [
  "& { param([int]$TargetPid)",
  "$ErrorActionPreference = 'Stop'",
  "$ownedProcess = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue",
  `if ($null -eq $ownedProcess) { [Console]::Out.Write('${ABSENT_IDENTITY}'); exit 0 }`,
  "$started = $ownedProcess.StartTime.ToUniversalTime().Ticks",
  "$path = $ownedProcess.Path",
  "$name = $ownedProcess.ProcessName",
  "[Console]::Out.Write((@($ownedProcess.Id, $started, $path, $name) -join [Environment]::NewLine))",
  "}"
].join("; ");
class WindowsProcessTreeTerminationError extends Error {
  constructor(reason) {
    super(messageFor(reason));
    this.reason = reason;
    this.name = "WindowsProcessTreeTerminationError";
  }
  reason;
}
class WindowsProcessTreeTerminator {
  environment;
  commandRunner;
  identityReader;
  timeoutMilliseconds;
  jobEmptyTimeoutMilliseconds;
  jobPollIntervalMilliseconds;
  now;
  delay;
  constructor(options = {}) {
    this.environment = options.environment ?? process.env;
    this.commandRunner = options.commandRunner ?? nodeProcessCommandRunner;
    this.timeoutMilliseconds = positiveInteger$1(
      options.timeoutMilliseconds,
      DEFAULT_TIMEOUT_MILLISECONDS
    );
    this.identityReader = options.identityReader ?? ((pid) => this.readIdentity(pid));
    this.jobEmptyTimeoutMilliseconds = positiveInteger$1(
      options.jobEmptyTimeoutMilliseconds,
      DEFAULT_TIMEOUT_MILLISECONDS
    );
    this.jobPollIntervalMilliseconds = positiveInteger$1(
      options.jobPollIntervalMilliseconds,
      10
    );
    this.now = options.now ?? Date.now;
    this.delay = options.delay ?? ((milliseconds) => new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }));
  }
  async capture(ownership) {
    assertRootPid(ownership.rootPid);
    if (ownership.mode === "JOB_OWNED") {
      if (!ownership.job.token || ownership.job.isReleased()) {
        throw new WindowsProcessTreeTerminationError("JOB_OWNERSHIP_LOST");
      }
      return {
        mode: "JOB_OWNED",
        rootPid: ownership.rootPid,
        token: ownership.job.token,
        job: ownership.job
      };
    }
    const identity2 = await this.readIdentityFailClosed(ownership.rootPid);
    if (!identity2) {
      throw new WindowsProcessTreeTerminationError("IDENTITY_UNAVAILABLE");
    }
    return {
      mode: "LEGACY_ROOT_OWNED",
      rootPid: ownership.rootPid,
      fingerprint: fingerprint(identity2)
    };
  }
  async terminate(identity2, stillOwnsIdentity) {
    assertRootPid(identity2.rootPid);
    if (!stillOwnsIdentity(identity2)) {
      throw new WindowsProcessTreeTerminationError("OWNERSHIP_LOST");
    }
    if (identity2.mode === "JOB_OWNED") {
      return this.terminateJob(identity2, stillOwnsIdentity);
    }
    const current = await this.readIdentityFailClosed(identity2.rootPid);
    if (!current) return "already-exited";
    if (fingerprint(current) !== identity2.fingerprint) {
      throw new WindowsProcessTreeTerminationError("IDENTITY_CHANGED");
    }
    if (!stillOwnsIdentity(identity2)) {
      const afterOwnershipLoss = await this.readIdentityFailClosed(identity2.rootPid);
      if (!afterOwnershipLoss) return "already-exited";
      if (fingerprint(afterOwnershipLoss) !== identity2.fingerprint) {
        throw new WindowsProcessTreeTerminationError("IDENTITY_CHANGED");
      }
      throw new WindowsProcessTreeTerminationError("OWNERSHIP_LOST");
    }
    try {
      await this.commandRunner.run(
        this.systemExecutable("taskkill.exe"),
        ["/PID", String(identity2.rootPid), "/T", "/F"],
        {
          timeoutMilliseconds: this.timeoutMilliseconds,
          maximumOutputBytes: MAXIMUM_OUTPUT_BYTES
        }
      );
      return "terminated";
    } catch {
      const afterFailure = await this.readIdentityFailClosed(identity2.rootPid);
      if (!afterFailure) return "already-exited";
      if (fingerprint(afterFailure) !== identity2.fingerprint) {
        throw new WindowsProcessTreeTerminationError("IDENTITY_CHANGED");
      }
      throw new WindowsProcessTreeTerminationError("TASKKILL_FAILED");
    }
  }
  async terminateJob(identity2, stillOwnsIdentity) {
    if (identity2.job.isReleased()) return "already-exited";
    if (identity2.job.token !== identity2.token || !stillOwnsIdentity(identity2)) {
      throw new WindowsProcessTreeTerminationError("JOB_OWNERSHIP_LOST");
    }
    let activeProcesses;
    let wasAlreadyEmpty;
    try {
      activeProcesses = validActiveProcessCount(identity2.job.activeProcessCount());
      wasAlreadyEmpty = activeProcesses === 0;
      if (activeProcesses > 0) identity2.job.terminate();
    } catch {
      throw new WindowsProcessTreeTerminationError("JOB_TERMINATION_FAILED");
    }
    const deadline2 = this.now() + this.jobEmptyTimeoutMilliseconds;
    while (activeProcesses > 0) {
      if (!stillOwnsIdentity(identity2) || identity2.job.token !== identity2.token) {
        throw new WindowsProcessTreeTerminationError("JOB_OWNERSHIP_LOST");
      }
      if (this.now() >= deadline2) {
        throw new WindowsProcessTreeTerminationError("JOB_EMPTY_TIMEOUT");
      }
      await this.delay(this.jobPollIntervalMilliseconds);
      try {
        activeProcesses = validActiveProcessCount(identity2.job.activeProcessCount());
      } catch {
        throw new WindowsProcessTreeTerminationError("JOB_TERMINATION_FAILED");
      }
    }
    if (!stillOwnsIdentity(identity2)) {
      throw new WindowsProcessTreeTerminationError("JOB_OWNERSHIP_LOST");
    }
    try {
      identity2.job.release();
    } catch {
      throw new WindowsProcessTreeTerminationError("JOB_RELEASE_FAILED");
    }
    return wasAlreadyEmpty ? "already-exited" : "terminated";
  }
  async readIdentityFailClosed(pid) {
    try {
      const identity2 = await this.identityReader(pid);
      if (identity2 === null) return null;
      if (identity2.pid !== pid || !identity2.startTimeTicks || !identity2.executablePath || !identity2.processName) {
        throw new Error("Incomplete Windows process identity.");
      }
      return identity2;
    } catch (error) {
      if (error instanceof WindowsProcessTreeTerminationError) throw error;
      throw new WindowsProcessTreeTerminationError("IDENTITY_UNAVAILABLE");
    }
  }
  async readIdentity(pid) {
    const result = await this.commandRunner.run(
      this.systemExecutable("WindowsPowerShell\\v1.0\\powershell.exe"),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        IDENTITY_SCRIPT,
        "-TargetPid",
        String(pid)
      ],
      {
        timeoutMilliseconds: this.timeoutMilliseconds,
        maximumOutputBytes: MAXIMUM_OUTPUT_BYTES
      }
    );
    const output = result.stdout.trim();
    if (output === ABSENT_IDENTITY) return null;
    const [rawPid, startTimeTicks, executablePath, processName, ...unexpected] = output.split(/\r?\n/);
    const parsedPid = Number(rawPid);
    if (unexpected.length > 0 || !Number.isSafeInteger(parsedPid) || parsedPid !== pid || !startTimeTicks || !executablePath || !processName) {
      throw new Error("Windows returned an invalid process identity.");
    }
    return { pid: parsedPid, startTimeTicks, executablePath, processName };
  }
  systemExecutable(relativePath) {
    const systemRoot = environmentValue(this.environment, "SystemRoot") ?? environmentValue(this.environment, "windir");
    if (!systemRoot || !node_path.win32.isAbsolute(systemRoot)) {
      throw new WindowsProcessTreeTerminationError("IDENTITY_UNAVAILABLE");
    }
    return node_path.win32.join(systemRoot, "System32", relativePath);
  }
}
const nodeProcessCommandRunner = {
  run(executable, args, options) {
    return new Promise((resolve, reject) => {
      node_child_process.execFile(executable, [...args], {
        windowsHide: true,
        shell: false,
        timeout: options.timeoutMilliseconds,
        maxBuffer: options.maximumOutputBytes,
        encoding: "utf8"
      }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  }
};
function assertRootPid(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > MAXIMUM_WINDOWS_PID) {
    throw new WindowsProcessTreeTerminationError("INVALID_PID");
  }
}
function fingerprint(identity2) {
  return [
    identity2.pid,
    identity2.startTimeTicks,
    identity2.executablePath.toLocaleLowerCase("en-US"),
    identity2.processName.toLocaleLowerCase("en-US")
  ].join("\0");
}
function environmentValue(environment, name) {
  return Object.entries(environment).find(
    ([key]) => key.toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US")
  )?.[1];
}
function positiveInteger$1(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
function validActiveProcessCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Windows returned an invalid Job active-process count.");
  }
  return value;
}
function messageFor(reason) {
  switch (reason) {
    case "INVALID_PID":
      return "The owned terminal root PID is invalid.";
    case "IDENTITY_UNAVAILABLE":
      return "The owned terminal root identity could not be verified.";
    case "OWNERSHIP_LOST":
      return "The terminal no longer owns the process tree.";
    case "IDENTITY_CHANGED":
      return "The terminal root PID now identifies a different process.";
    case "TASKKILL_FAILED":
      return "Windows could not terminate the owned terminal process tree.";
    case "JOB_OWNERSHIP_LOST":
      return "The terminal no longer owns its Windows Job Object.";
    case "JOB_TERMINATION_FAILED":
      return "Windows could not terminate the owned terminal Job.";
    case "JOB_EMPTY_TIMEOUT":
      return "The owned terminal Job did not become empty in time.";
    case "JOB_RELEASE_FAILED":
      return "The empty terminal Job could not be released safely.";
  }
}
let WindowsPipedProcessAdapter$1 = class WindowsPipedProcessAdapter {
  constructor(modulePath = node_path.join(__dirname, "native/run-process.node"), environment = process.env) {
    this.environment = environment;
    if (process.platform !== "win32" || process.arch !== "x64") throw new DomainError({
      code: "UNSUPPORTED",
      retryable: false,
      operation: "run:native",
      message: "Run currently requires Windows x64."
    });
    const binding = node_module.createRequire(__filename)(modulePath);
    if (binding.capability !== "student-ide-piped-job-v1" || typeof binding.createRun !== "function") {
      throw new Error("Run native capability mismatch.");
    }
    this.native = binding;
  }
  environment;
  native;
  create(run, observe) {
    if (run.shell !== false || !Array.isArray(run.args) || run.args.length > 1024 || !run.environmentAdditions || Object.keys(run.environmentAdditions).length !== 0) {
      throw new Error("Unsupported Run execution preparation.");
    }
    const environment = Object.entries(this.environment).filter(([key, value]) => value !== void 0 && !/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE)$/i.test(key) && !key.includes("=") && !key.includes("\0") && !value.includes("\0")).sort(([a], [b]) => a.toUpperCase().localeCompare(b.toUpperCase())).map(([key, value]) => `${key}=${value}`);
    const stdout = new node_string_decoder.StringDecoder("utf8"), stderr = new node_string_decoder.StringDecoder("utf8");
    let resolveSettled;
    const settled = new Promise((resolve) => {
      resolveSettled = resolve;
    });
    let rootObserved = false, stdoutEof = false, stderrEof = false, released = false;
    let observationFailed = false;
    const emit = (event) => {
      try {
        observe(event);
      } catch {
        observationFailed = true;
      }
    };
    const handle = this.native.createRun(run.executable, run.args, run.cwd, environment, (event) => {
      if (released) return;
      if (event.type === "stdout" || event.type === "stderr") {
        const data = (event.type === "stdout" ? stdout : stderr).write(event.data);
        if (data) emit({ type: event.type, data });
      } else if (event.type === "stdout-eof" || event.type === "stderr-eof") {
        const isOut = event.type === "stdout-eof";
        const data = (isOut ? stdout : stderr).end();
        if (data) emit({ type: isOut ? "stdout" : "stderr", data });
        if (isOut) stdoutEof = true;
        else stderrEof = true;
        emit({ type: event.type });
      } else if (event.type === "exit") {
        rootObserved = true;
        emit(event);
      } else if (event.type === "settled") {
        resolveSettled();
      } else {
        observationFailed = true;
        emit({ type: "error", message: "Run process observation failed." });
      }
    });
    const job = {
      token: `run-job_${node_crypto.randomUUID()}`,
      activeProcessCount: () => Number(this.native.control(handle, "count")),
      terminate: () => {
        this.native.control(handle, "terminate");
      },
      release: () => {
        if (!rootObserved || !stdoutEof || !stderrEof) throw new Error("Run observers have not settled.");
        this.native.control(handle, "release");
        released = true;
      },
      isReleased: () => released
    };
    const ownership = { mode: "JOB_OWNED", rootPid: Number(this.native.control(handle, "pid")), job };
    const terminator = new WindowsProcessTreeTerminator();
    let closing;
    return {
      ownership,
      settled,
      isReleased: () => released,
      close: () => {
        if (released) return Promise.resolve();
        if (closing) return closing;
        closing = (async () => {
          job.terminate();
          await boundedSettlement$1(settled);
          const identity2 = await terminator.capture(ownership);
          await terminator.terminate(identity2, () => !released);
          if (observationFailed) emit({ type: "error", message: "Run output could not be fully observed." });
        })().finally(() => {
          closing = void 0;
        });
        return closing;
      }
    };
  }
};
function boundedSettlement$1(settled) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Run observer cleanup timed out.")), 5e3);
    settled.then(() => {
      clearTimeout(timer);
      resolve();
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
const ranks = { OWNED: 0, RELEASE_READY: 1, FINALIZED: 2, CLEANUP_COMPLETE: 3 };
function failure(kind, message) {
  return Object.assign(new Error(message), { kind });
}
function recordPaths(root2, sessionId) {
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) throw failure("OWNERSHIP", "Invalid session identity");
  return { workspace: node_path.join(root2, "sessions", `session-${sessionId}`), recordPath: node_path.join(root2, "dispositions", `${sessionId}.json`), leasePath: node_path.join(root2, "leases", `${sessionId}.lock`) };
}
async function identity(path) {
  const s = await promises.lstat(path, { bigint: true });
  if (!s.isDirectory() || s.isSymbolicLink()) throw failure("OWNERSHIP", "Workspace identity/reparse failure");
  return { dev: String(s.dev), ino: String(s.ino), birthtimeNs: String(s.birthtimeNs) };
}
function validateRecord(r2, root2) {
  if (!r2 || r2.schemaVersion !== 2 || !Object.hasOwn(ranks, r2.checkpoint) || r2.revision !== ranks[r2.checkpoint]) throw failure("PERSISTENCE", "Invalid checkpoint schema");
  const p = recordPaths(node_path.resolve(root2), r2.sessionId);
  if (r2.owner !== `exercise:${r2.sessionId}` || r2.root !== node_path.resolve(root2) || r2.workspace !== p.workspace || !r2.workspaceIdentity || !r2.hostEpoch) throw failure("OWNERSHIP", "Checkpoint scope/owner mismatch");
  if (r2.checkpoint !== "OWNED") {
    const proof = r2.proof;
    if (!proof || !["VERIFIED", "HISTORY_UNVERIFIED"].includes(proof.kind) || !proof.allRetainedSignaled || !proof.jobEmpty || !proof.observerSettled || proof.unresolvedErrors !== 0) throw failure("PERSISTENCE", "Missing termination evidence");
    if (proof.kind === "HISTORY_UNVERIFIED" && (r2.processClean || r2.cleanupComplete || r2.workspaceState !== "QUARANTINED")) throw failure("PERSISTENCE", "Historical gap mislabeled clean");
  }
  if (r2.checkpoint === "RELEASE_READY" && (r2.finalized || r2.processClean || r2.cleanupComplete)) throw failure("PERSISTENCE", "Unreleased record claims finalization");
  if (r2.checkpoint === "FINALIZED" || r2.checkpoint === "CLEANUP_COMPLETE") {
    if (!r2.finalized || r2.nativeStage !== "HANDLES_CLOSED" || r2.processClean !== (r2.proof.kind === "VERIFIED")) throw failure("PERSISTENCE", "Invalid finalization evidence");
  }
  if (r2.checkpoint === "CLEANUP_COMPLETE" && (!r2.processClean || !r2.cleanupComplete || r2.workspaceState !== "REMOVED")) throw failure("PERSISTENCE", "Invalid complete record");
  return r2;
}
async function readCheckpoint(path, root2) {
  if (node_path.dirname(node_path.resolve(path)) !== node_path.join(node_path.resolve(root2), "dispositions")) throw failure("OWNERSHIP", "Record path outside dispositions");
  const info = await promises.lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw failure("PERSISTENCE", "Unsafe checkpoint file");
  const r2 = validateRecord(JSON.parse(await promises.readFile(path, "utf8")), root2);
  if (recordPaths(root2, r2.sessionId).recordPath !== path) throw failure("OWNERSHIP", "Record/session identity mismatch");
  return r2;
}
async function acknowledge(path, record, inject = () => {
}) {
  validateRecord(record, record.root);
  try {
    let previous;
    try {
      previous = await readCheckpoint(path, record.root);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (previous && previous.revision > record.revision) throw failure("PERSISTENCE", "Checkpoint regression refused");
    const body = JSON.stringify(record);
    if (!previous || JSON.stringify(previous) !== body) {
      inject(record.checkpoint, "before-write");
      await promises.mkdir(node_path.dirname(path), { recursive: true });
      const temporary = `${path}.${node_crypto.randomUUID()}.tmp`;
      const f = await promises.open(temporary, "wx");
      try {
        await f.writeFile(body);
        await f.sync();
      } finally {
        await f.close();
      }
      inject(record.checkpoint, "before-replace");
      await promises.rename(temporary, path);
    }
    inject(record.checkpoint, "before-readback");
    const written = await readCheckpoint(path, record.root);
    if (JSON.stringify(written) !== body) throw failure("PERSISTENCE", "Checkpoint read-back mismatch");
    return written;
  } catch (e) {
    throw Object.assign(e, { kind: "PERSISTENCE" });
  }
}
async function safeRemove(root2, workspace, expectedIdentity, denied = false) {
  if (node_path.dirname(node_path.resolve(workspace)) !== node_path.resolve(root2) || !/^session-[0-9a-f-]{36}$/.test(workspace.slice(workspace.lastIndexOf("\\") + 1))) throw failure("OWNERSHIP", "Unsafe workspace containment");
  let current;
  try {
    current = await identity(workspace);
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  if (expectedIdentity && JSON.stringify(current) !== JSON.stringify(expectedIdentity)) throw failure("OWNERSHIP", "Workspace identity changed");
  async function check(path) {
    const info = await promises.lstat(path);
    if (info.isSymbolicLink()) throw failure("OWNERSHIP", "Workspace reparse point");
    if (info.isDirectory()) for (const name of await promises.readdir(path)) await check(node_path.join(path, name));
  }
  await check(workspace);
  if (denied) throw Object.assign(failure("WORKSPACE", "Injected EACCES"), { code: "EACCES" });
  try {
    await promises.rm(workspace, { recursive: true, force: false, maxRetries: 0 });
  } catch (e) {
    throw Object.assign(e, { kind: "WORKSPACE" });
  }
}
const pause = (ms = 15) => new Promise((r2) => setTimeout(r2, ms));
async function until(check, deadlineMs = 12e3) {
  const deadline2 = node_perf_hooks.performance.now() + deadlineMs;
  while (node_perf_hooks.performance.now() < deadline2) {
    if (await check()) return;
    await pause();
  }
  throw Error("Observation deadline exceeded");
}
class PolicySession {
  name = "PolicyBExercise-staged-spike";
  manager = new ProcessManager();
  sessionId = node_crypto.randomUUID();
  hostEpoch = node_crypto.randomUUID();
  records = /* @__PURE__ */ new Map();
  log = [];
  started = node_perf_hooks.performance.now();
  sealed = false;
  released = false;
  processClean = false;
  cleanupComplete = false;
  finalized = false;
  disposition = null;
  proof = null;
  nativeStage = "OWNED";
  persistenceStage = "PENDING";
  workspaceState = "RETAINED";
  faults = {};
  hooks = {};
  capturesEnabled = true;
  coverageGaps = [];
  queryError = null;
  timer = null;
  child = null;
  handle = null;
  task = null;
  rootPid = 0;
  output = "";
  exitCode = null;
  phase = "";
  checkpoint = null;
  checkpointPayloads = /* @__PURE__ */ new Map();
  lease = null;
  lastError = null;
  stopCalls = 0;
  generation = 0;
  counters = { spawn: 0, query: 0, terminate: 0, release: 0, handlesClosed: 0, delete: 0 };
  constructor(root2, nativePath2, environment = process.env) {
    this.root = node_path.resolve(root2);
    this.nativePath = nativePath2;
    this.environment = environment;
    this.native = node_module.createRequire(__filename)(nativePath2);
    this.owner = `exercise:${this.sessionId}`;
    Object.assign(this, recordPaths(this.root, this.sessionId));
  }
  mark(event, extra = {}) {
    this.log.push({ event, monotonicMs: node_perf_hooks.performance.now(), elapsedMs: node_perf_hooks.performance.now() - this.started, ...extra });
  }
  async prepare() {
    for (const dir of ["sessions", "dispositions", "leases"]) await promises.mkdir(node_path.join(this.root, dir), { recursive: true });
    this.lease = this.native.acquireLease(this.leasePath);
    if (!this.lease) throw failure("OWNERSHIP", "Session lease unavailable");
    await promises.mkdir(this.workspace);
    this.workspaceIdentity = await identity(this.workspace);
    await promises.writeFile(node_path.join(this.workspace, "manifest.json"), JSON.stringify({ schemaVersion: 2, owner: this.owner, processClean: false }));
    await this.persist("OWNED");
    return this;
  }
  async launch(executable, args, phase = "execute") {
    if (this.sealed) throw Error("ADMISSION_CLOSED");
    if (this.child || this.handle) throw Error("Session already launched");
    this.phase = phase;
    const adapter = new WindowsPipedProcessAdapter$1(this.nativePath, this.environment);
    adapter.native = {
      capability: this.native.capability,
      createRun: (...input) => {
        const handle = this.native.createRun(...input);
        this.handle = handle;
        return handle;
      },
      control: (handle, operation) => {
        if (this.released) throw failure("NATIVE", "Operation on released Job prohibited");
        if (operation === "terminate") this.counters.terminate++;
        if (operation === "release") {
          this.counters.release++;
          this.beforeRelease = this.native.jobMembers(handle);
          this.mark("native-release-start", { members: this.beforeRelease });
        }
        const result = this.native.control(handle, operation);
        if (operation === "release") this.mark("native-released");
        return result;
      }
    };
    const unregister = this.manager.register({ id: this.owner, ownerId: this.owner, close: () => this.finishProcess() });
    try {
      this.child = adapter.create({ executable, args, cwd: this.workspace, environmentAdditions: {}, shell: false }, (event) => {
        if (event.type === "stdout" || event.type === "stderr") this.output += event.data;
        if (event.type === "exit") {
          this.exitCode = event.exitCode;
          this.mark("root-exit", { code: event.exitCode });
        }
        if (event.type === "error") this.queryError = failure("PROCESS", "Native observer error");
      });
    } catch (e) {
      if (!this.handle) {
        unregister();
        this.launchFailed = true;
        this.mark("launch-rejected-before-session", { error: e.message });
      }
      throw e;
    }
    this.counters.spawn++;
    this.rootPid = this.child.ownership.rootPid;
    this.capture(this.rootPid, true);
    this.scan();
    this.timer = setInterval(() => {
      try {
        if (!this.released && this.capturesEnabled) this.scan();
      } catch (e) {
        this.queryError = e;
      }
    }, 15);
    this.mark("launched", { rootPid: this.rootPid, phase, executable });
    return this;
  }
  capture(pid, root2 = false) {
    if ([...this.records.values()].some((r2) => r2.pid === pid && this.native.waitState(r2.handle) === "PENDING")) return;
    let handle;
    try {
      handle = this.native.watch(pid);
      const id2 = this.native.memberIdentity(this.handle, handle);
      if (!id2.member) {
        this.native.closeHandle(handle);
        handle = null;
        if (root2) throw failure("OWNERSHIP", "Root no longer associated at capture");
        this.coverageGaps.push({ pid, reason: "no-longer-member" });
        return;
      }
      const key = `${id2.pid}:${id2.created}`;
      if (this.records.has(key)) {
        this.native.closeHandle(handle);
        return;
      }
      this.records.set(key, { ...id2, handle, root: root2, image: this.native.processImage(handle), signaled: false, closed: false });
      this.mark("handle-retained", { pid, key, root: root2 });
    } catch (e) {
      if (handle) this.native.closeHandle(handle);
      if (!root2 && !this.native.jobMembers(this.handle).includes(pid)) {
        this.coverageGaps.push({ pid, reason: "vanished-before-capture" });
        return;
      }
      throw e;
    }
  }
  query() {
    if (this.released || this.nativeStage !== "OWNED") throw failure("NATIVE", "Released Job must not be queried");
    this.counters.query++;
    if (this.faults.query) throw failure("PROCESS", "Injected current Job query failure");
    if (this.faults.ownership) throw failure("OWNERSHIP", "Injected ownership failure");
    if (!this.handle || this.child.isReleased()) throw failure("OWNERSHIP", "Invalid Job ownership");
    const members = this.native.jobMembers(this.handle), accounting = this.native.accounting(this.handle);
    this.mark("job-snapshot", { members, accounting });
    return { members, accounting };
  }
  scan() {
    const q = this.query();
    for (const pid of q.members) if (this.capturesEnabled) this.capture(pid);
    for (const r2 of this.records.values()) if (!r2.closed && this.native.waitState(r2.handle) === "SIGNALED" && !r2.signaled) {
      r2.signaled = true;
      this.mark("handle-signaled", { pid: r2.pid, created: r2.created });
    }
    return q;
  }
  baseRecord(checkpoint) {
    const finalized = checkpoint === "FINALIZED" || checkpoint === "CLEANUP_COMPLETE", verified = this.proof?.kind === "VERIFIED";
    return {
      schemaVersion: 2,
      sessionId: this.sessionId,
      owner: this.owner,
      hostEpoch: this.hostEpoch,
      root: this.root,
      workspace: this.workspace,
      workspaceIdentity: this.workspaceIdentity,
      checkpoint,
      revision: ranks[checkpoint],
      proof: this.proof,
      finalized,
      nativeStage: finalized ? "HANDLES_CLOSED" : "OWNED",
      processClean: finalized && verified,
      cleanupComplete: checkpoint === "CLEANUP_COMPLETE",
      workspaceState: this.proof?.kind === "HISTORY_UNVERIFIED" ? "QUARANTINED" : checkpoint === "CLEANUP_COMPLETE" ? "REMOVED" : finalized ? "DELETE_PENDING" : "RETAINED"
    };
  }
  async persist(checkpoint) {
    if (!this.checkpointPayloads.has(checkpoint)) this.checkpointPayloads.set(checkpoint, this.baseRecord(checkpoint));
    this.persistenceStage = "PENDING";
    await acknowledge(this.recordPath, this.checkpointPayloads.get(checkpoint), (phase, point) => {
      if (this.faults.persistence === phase && (this.faults.persistencePoint ?? "before-write") === point) throw failure("PERSISTENCE", `Injected ${phase} ${point} failure`);
    });
    this.checkpoint = checkpoint;
    this.persistenceStage = "ACKNOWLEDGED";
    this.mark("checkpoint-acknowledged", { checkpoint });
  }
  beginShutdown() {
    if (!this.sealed) {
      this.sealed = true;
      this.generation++;
      this.mark("admission-closed");
    }
    this.backgroundTask = this.close();
    void this.backgroundTask.catch((e) => {
      this.lastError ??= { kind: e.kind ?? "PROCESS", message: e.message };
    });
  }
  start() {
  }
  async stop() {
    this.stopCalls++;
    await this.close();
  }
  close(deadlineMs = 12e3) {
    this.sealed = true;
    if (this.task) return this.task;
    if (this.finalized) return Promise.resolve(this.summary());
    this.deadline = node_perf_hooks.performance.now() + deadlineMs;
    const task = (async () => {
      try {
        if (this.manager.size) await this.manager.cleanupOwner(this.owner);
        if (this.launchFailed) {
          this.closeLease();
          return this.summary();
        }
        if (this.checkpoint !== "FINALIZED" && this.checkpoint !== "CLEANUP_COMPLETE") throw failure("PERSISTENCE", "Finalized record missing");
        if (this.proof.kind === "VERIFIED") {
          this.processClean = true;
          this.workspaceState = "DELETE_PENDING";
          this.counters.delete++;
          await safeRemove(node_path.join(this.root, "sessions"), this.workspace, this.workspaceIdentity, this.faults.delete);
          this.workspaceState = "REMOVED";
          await this.persist("CLEANUP_COMPLETE");
          this.cleanupComplete = true;
          this.mark("CLEANUP_COMPLETE");
        } else {
          this.workspaceState = "QUARANTINED";
          this.mark("SERVICE_FINALIZED_WITH_HISTORY_UNVERIFIED");
        }
        this.disposition = this.proof.kind === "VERIFIED" ? "CLEAN" : "HISTORY_UNVERIFIED";
        this.finalized = true;
        this.lastError = null;
        this.closeLease();
        return this.summary();
      } catch (e) {
        let cause = e;
        while (cause instanceof AggregateError && cause.errors.length) cause = cause.errors[0];
        const kind = cause.kind ?? "PROCESS";
        this.lastError = { kind, message: cause.message };
        if (kind !== "PERSISTENCE" && kind !== "WORKSPACE") this.disposition = "PROCESS_UNRESOLVED";
        this.mark("cleanup-rejected", { kind, message: e.message, resources: this.manager.size });
        throw e;
      }
    })();
    this.task = task;
    void task.finally(() => {
      if (this.task === task) this.task = null;
    }).catch(() => {
    });
    return task;
  }
  async verifyTermination() {
    if (this.queryError) throw this.queryError;
    this.scan();
    if (!this.faults.skipTerminate) {
      this.child.ownership.job.terminate();
      this.mark("terminate-returned");
    }
    while (true) {
      const q2 = this.scan();
      if ([...this.records.values()].every((r2) => r2.signaled) && !q2.members.length && !q2.accounting.activeProcesses) break;
      if (node_perf_hooks.performance.now() >= this.deadline) throw failure("PROCESS", "Process termination evidence deadline");
      await pause();
    }
    let settled = false;
    void this.child.settled.then(() => {
      settled = true;
    });
    while (!settled) {
      if (node_perf_hooks.performance.now() >= this.deadline) throw failure("PROCESS", "Observer settlement deadline");
      await pause();
    }
    const q = this.revalidate();
    this.finalAccounting = q.accounting;
    const kind = this.coverageGaps.length || q.accounting.totalProcesses !== this.records.size ? "HISTORY_UNVERIFIED" : "VERIFIED";
    this.proof = {
      kind,
      allRetainedSignaled: true,
      jobEmpty: true,
      observerSettled: true,
      unresolvedErrors: 0,
      retained: [...this.records.values()].map(({ handle, ...r2 }) => r2),
      accounting: q.accounting,
      coverageGaps: [...this.coverageGaps]
    };
    this.disposition = kind === "VERIFIED" ? "CLEAN" : "HISTORY_UNVERIFIED";
    this.mark(kind === "VERIFIED" ? "TERMINATION_VERIFIED" : "HISTORY_UNVERIFIED");
  }
  revalidate() {
    if (this.queryError) throw this.queryError;
    const q = this.scan();
    if (q.members.length || q.accounting.activeProcesses || ![...this.records.values()].every((r2) => this.native.waitState(r2.handle) === "SIGNALED")) throw failure("PROCESS", "Termination evidence changed");
    return q;
  }
  async finishProcess() {
    this.mark("cleanup-stage-entry", { nativeStage: this.nativeStage });
    if (this.nativeStage === "OWNED") {
      if (!this.proof) await this.verifyTermination();
      await this.persist("RELEASE_READY");
      this.revalidate();
      clearInterval(this.timer);
      this.timer = null;
      try {
        this.child.ownership.job.release();
      } catch (e) {
        throw Object.assign(e, { kind: "NATIVE" });
      }
      this.released = true;
      this.nativeStage = "JOB_RELEASED";
      if (this.hooks.afterRelease) await this.hooks.afterRelease();
    }
    if (this.nativeStage === "JOB_RELEASED") {
      for (const r2 of this.records.values()) if (!r2.closed) {
        if (this.native.waitState(r2.handle) !== "SIGNALED") throw failure("NATIVE", "Retained handle not terminated");
        this.native.closeHandle(r2.handle);
        r2.closed = true;
        this.counters.handlesClosed++;
      }
      this.nativeStage = "HANDLES_CLOSED";
      this.mark("observed-handles-closed");
    }
    await this.persist("FINALIZED");
    if (this.proof.kind === "VERIFIED") {
      this.processClean = true;
      this.mark("PROCESS_CLEAN");
    }
  }
  closeLease() {
    if (this.lease) {
      this.native.closeHandle(this.lease);
      this.lease = null;
      this.mark("lease-released");
    }
  }
  summary() {
    return {
      owner: this.owner,
      sessionId: this.sessionId,
      workspace: this.workspace,
      recordPath: this.recordPath,
      disposition: this.disposition,
      proof: this.proof,
      nativeStage: this.nativeStage,
      persistenceStage: this.persistenceStage,
      workspaceState: this.workspaceState,
      checkpoint: this.checkpoint,
      lastError: this.lastError,
      processClean: this.processClean,
      cleanupComplete: this.cleanupComplete,
      finalized: this.finalized,
      released: this.released,
      managerResources: this.manager.size,
      counters: { ...this.counters },
      phase: this.phase,
      rootPid: this.rootPid,
      accounting: this.finalAccounting,
      retained: [...this.records.values()].map(({ handle, ...r2 }) => r2),
      coverageGaps: this.coverageGaps,
      output: this.output.slice(0, 4096),
      exitCode: this.exitCode,
      timeline: [...this.log]
    };
  }
  async safety() {
    clearInterval(this.timer);
    this.timer = null;
    this.native.setFault(0);
    if (!this.released && this.child) {
      this.child.ownership.job.terminate();
      await this.child.settled;
      await until(() => [...this.records.values()].every((r2) => r2.closed || this.native.waitState(r2.handle) === "SIGNALED"));
      if (this.child.ownership.job.activeProcessCount() !== 0) throw Error("Safety Job not empty");
      this.child.ownership.job.release();
      this.released = true;
      this.nativeStage = "JOB_RELEASED";
    }
    for (const r2 of this.records.values()) if (!r2.closed) {
      this.native.closeHandle(r2.handle);
      r2.closed = true;
    }
    this.closeLease();
  }
}
function validateExactObject(value, fields) {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "Expected an object" }]
    };
  }
  const allowed = new Set(fields);
  const unknownFields = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownFields.length > 0) {
    return {
      ok: false,
      issues: unknownFields.map((key) => ({
        path: `$.${key}`,
        message: "Unknown field"
      }))
    };
  }
  return { ok: true, value };
}
function isPlainObject(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function invalid(path) {
  return { ok: false, issues: [{ path, message: "Invalid Run field" }] };
}
function isRunSessionId(value) {
  return typeof value === "string" && /^run_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
}
function target(value) {
  if (typeof value.projectId !== "string" || !/^project_[a-f0-9]{24}$/.test(value.projectId)) {
    return invalid("$.projectId");
  }
  const path = value.relativePath;
  if (typeof path !== "string" || !path || /[\\<>:"|?*]/.test(path) || [...path].some((character) => character.charCodeAt(0) < 32) || path.split("/").some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    return invalid("$.relativePath");
  }
  return { ok: true, value: { projectId: value.projectId, relativePath: path } };
}
function validateStartRunRequest(value) {
  const object = validateExactObject(value, ["projectId", "relativePath", "dirty"]);
  if (!object.ok) return object;
  const validated = target(object.value);
  if (!validated.ok) return validated;
  if (typeof object.value.dirty !== "boolean") return invalid("$.dirty");
  return { ok: true, value: { ...validated.value, dirty: object.value.dirty } };
}
function validateStopRunRequest(value) {
  const object = validateExactObject(value, ["sessionId"]);
  if (!object.ok) return object;
  return isRunSessionId(object.value.sessionId) ? { ok: true, value: { sessionId: object.value.sessionId } } : invalid("$.sessionId");
}
async function createProjectIdentity(rootPath, fileSystem, platform = process.platform) {
  if (!isAbsoluteForPlatform(rootPath, platform)) {
    throw new DomainError({
      code: "INVALID_INPUT",
      message: "Project root must be an absolute path.",
      operation: "project:identify",
      retryable: false
    });
  }
  const canonicalRoot = await fileSystem.realpath(rootPath);
  const stats = await fileSystem.stat(canonicalRoot);
  if (!stats.isDirectory()) {
    throw new DomainError({
      code: "INVALID_INPUT",
      message: "Project root must be a directory.",
      operation: "project:identify",
      retryable: false
    });
  }
  const pathIdentity = normalizePathIdentity(canonicalRoot, platform);
  const id2 = `project_${node_crypto.createHash("sha256").update(pathIdentity).digest("hex").slice(0, 24)}`;
  return {
    id: id2,
    name: platform === "win32" ? win32.basename(canonicalRoot) : node_path.basename(canonicalRoot),
    canonicalRoot,
    pathIdentity
  };
}
function normalizePathIdentity(value, platform = process.platform) {
  if (platform === "win32") {
    const normalized2 = win32.normalize(value);
    return trimTrailingSeparator(
      normalized2,
      win32.sep,
      win32.parse(normalized2).root.length
    ).toLocaleLowerCase("en-US");
  }
  const normalized = node_path.normalize(value);
  return trimTrailingSeparator(
    normalized,
    node_path.sep,
    node_path.parse(normalized).root.length
  );
}
function resolveProjectRelativePath(canonicalRoot, relativePath, platform = process.platform) {
  if (relativePath.length === 0 || relativePath.includes("\0") || relativePath.split(/[\\/]/).includes("..") || platform === "win32" && hasInvalidWindowsPathSegment(relativePath) || win32.isAbsolute(relativePath) || posix.isAbsolute(relativePath)) {
    throw invalidProjectPath();
  }
  const pathIdentity = normalizePathIdentity(canonicalRoot, platform);
  const resolved = platform === "win32" ? win32.resolve(canonicalRoot, relativePath) : node_path.resolve(canonicalRoot, relativePath);
  const resolvedIdentity = normalizePathIdentity(resolved, platform);
  const separator = platform === "win32" ? win32.sep : node_path.sep;
  const descendantPrefix = pathIdentity.endsWith(separator) ? pathIdentity : `${pathIdentity}${separator}`;
  if (resolvedIdentity !== pathIdentity && !resolvedIdentity.startsWith(descendantPrefix)) {
    throw invalidProjectPath();
  }
  return platform === "win32" ? win32.normalize(resolved) : posix.normalize(resolved);
}
function hasInvalidWindowsPathSegment(relativePath) {
  return relativePath.split(/[\\/]/).some((segment) => {
    const baseName = segment.split(".")[0]?.toUpperCase() ?? "";
    return segment.length === 0 || /[<>:"|?*]/.test(segment) || /[. ]$/.test(segment) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(baseName);
  });
}
function isAbsoluteForPlatform(value, platform) {
  return platform === "win32" ? win32.isAbsolute(value) : node_path.isAbsolute(value);
}
function trimTrailingSeparator(value, separator, rootLength) {
  let result = value;
  while (result.length > rootLength && result.endsWith(separator)) {
    result = result.slice(0, -1);
  }
  return result;
}
function invalidProjectPath() {
  return new DomainError({
    code: "INVALID_INPUT",
    message: "Project-relative path is invalid.",
    operation: "project:resolve-path",
    retryable: false
  });
}
class JavaScriptRunStrategy {
  supports(target2) {
    return node_path.win32.extname(target2.relativePath) === ".js";
  }
  prepare(target2, runtime2) {
    if (!this.supports(target2)) {
      throw new DomainError({
        code: "UNSUPPORTED",
        retryable: false,
        operation: "run:prepare",
        message: target2.relativePath.endsWith(".ts") ? "TypeScript Run is not supported in current V1." : "Run supports JavaScript .js files only in current V1."
      });
    }
    resolveProjectRelativePath(target2.canonicalRoot, target2.relativePath, "win32");
    const root2 = normalizePathIdentity(target2.canonicalRoot, "win32");
    const file = normalizePathIdentity(target2.canonicalFile, "win32");
    if (!node_path.win32.isAbsolute(target2.canonicalRoot) || !node_path.win32.isAbsolute(target2.canonicalFile) || !file.startsWith(root2.endsWith("\\") ? root2 : `${root2}\\`) || node_path.win32.extname(target2.canonicalFile) !== ".js" || !node_path.win32.isAbsolute(runtime2.executable) || runtime2.executable.includes("\0") || node_path.win32.basename(runtime2.executable).toLowerCase() !== "node.exe") {
      throw new DomainError({
        code: "INVALID_INPUT",
        retryable: false,
        operation: "run:prepare",
        message: "Invalid authorized Run target or runtime."
      });
    }
    return Object.freeze({
      executable: runtime2.executable,
      args: Object.freeze([target2.canonicalFile]),
      cwd: target2.canonicalRoot,
      environmentAdditions: Object.freeze({}),
      shell: false
    });
  }
}
class RunService {
  constructor(authority, execution) {
    this.authority = authority;
    this.execution = execution;
  }
  authority;
  execution;
  preparations = /* @__PURE__ */ new Map();
  processes = /* @__PURE__ */ new Map();
  strategies = [new JavaScriptRunStrategy()];
  sessions = /* @__PURE__ */ new Map();
  targets = /* @__PURE__ */ new Map();
  starts = /* @__PURE__ */ new Map();
  pendingStarts = /* @__PURE__ */ new Map();
  cleanupRequests = /* @__PURE__ */ new Map();
  projectBlocks = /* @__PURE__ */ new Map();
  projectGenerations = /* @__PURE__ */ new Map();
  ownerGenerations = /* @__PURE__ */ new Map();
  pendingOwners = /* @__PURE__ */ new Map();
  cleanupOwners = /* @__PURE__ */ new Map();
  stopping = false;
  // Small tombstones support late Stop without retaining processes/output indefinitely.
  completed = /* @__PURE__ */ new Map();
  async resolve(request, ownerId) {
    const validation = validateStartRunRequest(request);
    if (!validation.ok) throw invalidInputError("run:prepare", validation.issues.map((issue) => issue.path));
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) throw invalidInputError("run:prepare", ["owner"]);
    const target2 = validation.value;
    if (target2.dirty) throw new DomainError({
      code: "INVALID_INPUT",
      retryable: false,
      operation: "run:prepare",
      message: "Save this file before running it."
    });
    const strategy = this.strategies.find((candidate) => candidate.supports(target2));
    if (!strategy) throw new DomainError({
      code: "UNSUPPORTED",
      retryable: false,
      operation: "run:prepare",
      message: target2.relativePath.endsWith(".ts") ? "TypeScript Run is not supported in current V1." : "Run supports JavaScript .js files only in current V1."
    });
    const authorized = await this.authority.authorize(target2, ownerId);
    if (authorized.projectId !== target2.projectId || authorized.relativePath !== target2.relativePath) {
      throw invalidInputError("run:prepare", ["target"]);
    }
    const runtime2 = await this.authority.resolveRuntime();
    const execution = strategy.prepare(authorized, runtime2);
    return { target: target2, execution };
  }
  async prepare(request, ownerId) {
    const { target: target2, execution } = await this.resolve(request, ownerId);
    const identity2 = normalizePathIdentity(execution.args[0], "win32");
    if ([...this.preparations.values()].some((entry) => normalizePathIdentity(entry.execution.args[0], "win32") === identity2)) {
      throw new DomainError({
        code: "PROCESS_FAILED",
        retryable: true,
        operation: "run:prepare",
        message: "The previous Run preparation must be released first."
      });
    }
    const session2 = Object.freeze({
      projectId: target2.projectId,
      relativePath: target2.relativePath,
      sessionId: `run_${node_crypto.randomUUID()}`,
      state: "STARTING"
    });
    const preparation = Object.freeze({ session: session2, execution });
    this.preparations.set(session2.sessionId, { ...preparation, ownerId });
    return preparation;
  }
  startRun(request, ownerId) {
    const validation = validateStartRunRequest(request);
    if (!validation.ok) return Promise.reject(invalidInputError("run:start", ["target"]));
    const target2 = validation.value;
    const generation = this.projectGenerations.get(target2.projectId) ?? 0;
    const ownerGeneration = this.ownerGenerations.get(ownerId) ?? 0;
    const check = () => {
      if (this.stopping || this.projectBlocks.has(target2.projectId) || (this.ownerGenerations.get(ownerId) ?? 0) !== ownerGeneration || (this.projectGenerations.get(target2.projectId) ?? 0) !== generation) {
        throw runFailure("run:start", "Run is unavailable while this project is changing or closing.");
      }
    };
    const task = this.startAuthorized(target2, ownerId, check);
    this.pendingStarts.set(task, target2.projectId);
    this.pendingOwners.set(task, ownerId);
    void task.finally(() => this.pendingOwners.delete(task)).catch(() => void 0);
    void task.finally(() => this.pendingStarts.delete(task)).catch(() => void 0);
    return task;
  }
  /** Main lifecycle lease; invalidates earlier asynchronous starts, even after release. */
  suspendProject(projectId) {
    this.projectGenerations.set(projectId, (this.projectGenerations.get(projectId) ?? 0) + 1);
    this.projectBlocks.set(projectId, (this.projectBlocks.get(projectId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (this.projectBlocks.get(projectId) ?? 1) - 1;
      if (count) this.projectBlocks.set(projectId, count);
      else this.projectBlocks.delete(projectId);
    };
  }
  suppressProjectEvents(projectId) {
    for (const entry of this.sessions.values()) {
      if (entry.session.projectId === projectId) entry.muted = true;
    }
  }
  async stopProject(projectId) {
    await Promise.allSettled([...this.pendingStarts].filter(([, id2]) => id2 === projectId).map(([task]) => task));
    const results = await Promise.allSettled([...this.sessions.values()].filter((entry) => entry.session.projectId === projectId).map((entry) => this.stopRun(entry.session.sessionId, entry.ownerId)));
    const pending = await Promise.allSettled([...this.cleanupRequests].filter(([, id2]) => id2 === projectId).map(([task]) => task));
    if ([...results, ...pending].some((result) => result.status === "rejected")) {
      throw runFailure("run:project-cleanup", "Run cleanup failed. The project was not changed; retry the operation.");
    }
  }
  /** Main-only renderer navigation/destruction cleanup; project lifecycle stays separate. */
  async stopOwner(ownerId) {
    this.ownerGenerations.set(ownerId, (this.ownerGenerations.get(ownerId) ?? 0) + 1);
    for (const entry of this.sessions.values()) {
      if (entry.ownerId === ownerId) entry.muted = true;
    }
    await Promise.allSettled([...this.pendingOwners].filter(([, id2]) => id2 === ownerId).map(([task]) => task));
    const results = await Promise.allSettled([...this.sessions.values()].filter((entry) => entry.ownerId === ownerId).map((entry) => this.stopRun(entry.session.sessionId, ownerId)));
    const pending = await Promise.allSettled([...this.cleanupOwners].filter(([, id2]) => id2 === ownerId).map(([task]) => task));
    if ([...results, ...pending].some((result) => result.status === "rejected")) {
      throw runFailure("run:owner-cleanup", "Run cleanup failed. Application shutdown must be retried.");
    }
  }
  beginShutdown() {
    this.stopping = true;
    for (const entry of this.sessions.values()) entry.muted = true;
  }
  async stop() {
    this.beginShutdown();
    const projects = /* @__PURE__ */ new Set([
      ...this.pendingStarts.values(),
      ...this.cleanupRequests.values(),
      ...[...this.sessions.values()].map((entry) => entry.session.projectId)
    ]);
    const results = await Promise.allSettled([...projects].map((id2) => this.stopProject(id2)));
    if (results.some((result) => result.status === "rejected")) {
      throw runFailure("run:shutdown", "Run cleanup failed. Application shutdown must be retried.");
    }
  }
  async startAuthorized(request, ownerId, check) {
    check();
    if (!this.execution) throw runFailure("run:start", "Run execution is not configured.");
    let resolved;
    try {
      resolved = await this.resolve(request, ownerId);
    } catch (error) {
      throw safeStartError(error);
    }
    check();
    const identity2 = normalizePathIdentity(resolved.execution.args[0], "win32");
    const previous = this.starts.get(identity2) ?? Promise.resolve();
    const task = previous.catch(() => void 0).then(async () => {
      check();
      const old = this.targets.get(identity2);
      if (old) await this.stopRun(old.session.sessionId, ownerId);
      let preparation;
      try {
        preparation = await this.prepare(resolved.target, ownerId);
      } catch (error) {
        throw safeStartError(error);
      }
      try {
        check();
      } catch (error) {
        this.releasePreparation(preparation.session.sessionId, ownerId);
        throw error;
      }
      if (normalizePathIdentity(preparation.execution.args[0], "win32") !== identity2) {
        this.releasePreparation(preparation.session.sessionId, ownerId);
        throw invalidInputError("run:start", ["target"]);
      }
      let ready;
      const entry = {
        session: preparation.session,
        ownerId,
        identity: identity2,
        ready: new Promise((resolve) => {
          ready = resolve;
        }),
        exitCode: null,
        stdoutEof: false,
        stderrEof: false,
        cancelled: false,
        observationFailed: false,
        finalized: false
      };
      this.sessions.set(entry.session.sessionId, entry);
      this.targets.set(identity2, entry);
      this.emit(entry, { type: "state", session: entry.session });
      try {
        entry.process = await this.launchPrepared(
          entry.session.sessionId,
          ownerId,
          this.execution.adapter,
          this.execution.manager,
          (event) => this.observe(entry, event),
          {
            canLaunch: check,
            cleanup: () => this.cleanup(entry),
            released: () => {
              if (entry.exitCode === null || !entry.stdoutEof || !entry.stderrEof) {
                throw runFailure("run:cleanup", "Run process observers have not completed.");
              }
              this.finalize(entry, entry.observationFailed ? "FAILED" : entry.cancelled ? "CANCELLED" : entry.exitCode === 0 ? "EXITED" : "FAILED");
            }
          }
        );
        if (entry.session.state === "STARTING") this.transition(entry, "RUNNING");
        return entry.session;
      } catch (error) {
        const failure2 = safeStartError(error);
        this.emitError(entry, failure2);
        this.releasePreparation(entry.session.sessionId, ownerId);
        this.finalize(entry, "FAILED");
        throw failure2;
      } finally {
        ready();
      }
    });
    this.starts.set(identity2, task);
    try {
      return await task;
    } finally {
      if (this.starts.get(identity2) === task) this.starts.delete(identity2);
    }
  }
  getSession(sessionId, ownerId) {
    const entry = this.sessions.get(sessionId) ?? this.completed.get(sessionId);
    if (!entry || entry.ownerId !== ownerId) throw new DomainError({
      code: "PERMISSION_DENIED",
      operation: "run:session",
      message: "Run session is not owned by this window.",
      retryable: false
    });
    return entry.session;
  }
  async stopRun(sessionId, ownerId) {
    if (!validateStopRunRequest({ sessionId }).ok) throw invalidInputError("run:stop", ["sessionId"]);
    this.getSession(sessionId, ownerId);
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    if (entry.exitCode === null) entry.cancelled = true;
    this.transition(entry, "STOPPING");
    await this.requestCleanup(entry);
  }
  requestCleanup(entry) {
    const task = this.performCleanupRequest(entry);
    this.cleanupRequests.set(task, entry.session.projectId);
    this.cleanupOwners.set(task, entry.ownerId);
    void task.finally(() => this.cleanupOwners.delete(task)).catch(() => void 0);
    void task.finally(() => this.cleanupRequests.delete(task)).catch(() => void 0);
    return task;
  }
  async performCleanupRequest(entry) {
    await entry.ready;
    if (entry.finalized) return;
    try {
      await this.execution.manager.cleanupOwner(sessionOwner(entry.session.sessionId));
    } catch {
      throw runFailure("run:cleanup", "Run cleanup failed. Retry Stop before running this file again.");
    }
  }
  cleanup(entry) {
    if (entry.finalized) return Promise.resolve();
    if (entry.cleanup) return entry.cleanup;
    this.transition(entry, "STOPPING");
    const task = Promise.resolve().then(async () => {
      if (!entry.process) throw runFailure("run:cleanup", "Run process is not ready for cleanup.");
      await entry.process.close();
    }).catch(() => {
      const failure2 = runFailure("run:cleanup", "Run cleanup failed. Retry Stop before running this file again.");
      this.emitError(entry, failure2);
      throw failure2;
    }).finally(() => {
      if (entry.cleanup === task) entry.cleanup = void 0;
    });
    entry.cleanup = task;
    return task;
  }
  observe(entry, event) {
    if (entry.finalized || this.sessions.get(entry.session.sessionId) !== entry || this.targets.get(entry.identity) !== entry) return;
    if (event.type === "stdout" || event.type === "stderr") {
      if (event.type === "stdout" ? entry.stdoutEof : entry.stderrEof) return;
      this.emit(entry, { type: event.type, session: entry.session, data: event.data });
      return;
    }
    if (event.type === "stdout-eof") entry.stdoutEof = true;
    else if (event.type === "stderr-eof") entry.stderrEof = true;
    else if (event.type === "exit") {
      if (entry.exitCode !== null) return;
      entry.exitCode = event.exitCode;
      void this.requestCleanup(entry).catch(() => void 0);
    } else if (!entry.observationFailed) {
      entry.observationFailed = true;
      this.emitError(entry, runFailure("run:output", "Run output could not be fully observed."));
      void this.requestCleanup(entry).catch(() => void 0);
    }
  }
  transition(entry, state) {
    if (entry.finalized || entry.session.state === state) return;
    entry.session = Object.freeze({ ...entry.session, state });
    this.emit(entry, { type: "state", session: entry.session });
  }
  finalize(entry, state) {
    if (entry.finalized) return;
    entry.session = Object.freeze({ ...entry.session, state });
    entry.finalized = true;
    this.sessions.delete(entry.session.sessionId);
    if (this.targets.get(entry.identity) === entry) this.targets.delete(entry.identity);
    this.completed.set(entry.session.sessionId, { session: entry.session, ownerId: entry.ownerId });
    if (this.completed.size > 128) this.completed.delete(this.completed.keys().next().value);
    this.emit(entry, { type: "state", session: entry.session });
    this.emit(entry, { type: "exit", session: entry.session, exitCode: entry.exitCode });
  }
  emitError(entry, error) {
    const safe = serializeAppError(error);
    this.emit(entry, { type: "error", session: entry.session, error: {
      code: safe.code,
      message: safe.message,
      retryable: safe.retryable,
      ...safe.operation === void 0 ? {} : { operation: safe.operation },
      ...safe.details === void 0 ? {} : { details: safe.details }
    } });
  }
  emit(entry, event) {
    if (this.stopping || entry.muted) return;
    try {
      this.execution.onEvent(entry.ownerId, event);
    } catch {
      this.execution?.onEventSinkError?.(runFailure("run:event", "Run event delivery failed."));
    }
  }
  getPreparation(sessionId, ownerId) {
    const owned = this.preparations.get(sessionId);
    if (!owned || owned.ownerId !== ownerId) throw new DomainError({
      code: "PERMISSION_DENIED",
      retryable: false,
      operation: "run:session",
      message: "Run session is not owned by this window."
    });
    return { session: owned.session, execution: owned.execution };
  }
  /** Only unstarted preparations; never an execution/cleanup substitute. */
  releasePreparation(sessionId, ownerId) {
    this.getPreparation(sessionId, ownerId);
    if (this.processes.has(sessionId)) throw new Error("A live process must be cleaned before preparation release.");
    this.preparations.delete(sessionId);
  }
  /** 4B Main-only launch seam. Not a public Run command; no re-run/UI policy. */
  async launchPrepared(sessionId, ownerId, adapter, manager, observe, lifecycle) {
    const preparation = this.getPreparation(sessionId, ownerId);
    if (this.processes.has(sessionId)) throw new Error("Preparation has already launched.");
    const current = await this.authority.authorize({
      projectId: preparation.session.projectId,
      relativePath: preparation.session.relativePath,
      dirty: false
    }, ownerId);
    const execution = this.strategies.find((strategy) => strategy.supports(current)).prepare(current, await this.authority.resolveRuntime());
    this.getPreparation(sessionId, ownerId);
    if (this.processes.has(sessionId)) throw new Error("Preparation has already launched.");
    if (current.projectId !== preparation.session.projectId || current.relativePath !== preparation.session.relativePath || normalizePathIdentity(execution.args[0], "win32") !== normalizePathIdentity(preparation.execution.args[0], "win32")) {
      throw invalidInputError("run:launch", ["target"]);
    }
    let native2;
    lifecycle?.canLaunch?.();
    const unregister = manager.register({
      id: sessionId,
      ownerId: lifecycle ? sessionOwner(sessionId) : `run-owner:${ownerId}`,
      close: async () => {
        if (native2) await (lifecycle ? lifecycle.cleanup() : process2.close());
      }
    });
    try {
      native2 = adapter.create(execution, observe);
    } catch (error) {
      unregister();
      throw error;
    }
    const created = native2;
    const process2 = {
      ownership: created.ownership,
      settled: created.settled,
      isReleased: () => created.isReleased(),
      close: async () => {
        await created.close();
        if (!created.isReleased()) throw new Error("Native Run resource was not released.");
        lifecycle?.released();
        this.processes.delete(sessionId);
        this.preparations.delete(sessionId);
        unregister();
      }
    };
    this.processes.set(sessionId, process2);
    return process2;
  }
}
function sessionOwner(sessionId) {
  return `run-session:${sessionId}`;
}
function runFailure(operation, message) {
  return new DomainError({ code: "PROCESS_FAILED", operation, message, retryable: true });
}
function safeStartError(error) {
  return error instanceof DomainError ? error : runFailure("run:start", "The Run process could not be started.");
}
class WindowsPipedProcessAdapter2 {
  constructor(modulePath = node_path.join(__dirname, "native/run-process.node"), environment = process.env) {
    this.environment = environment;
    if (process.platform !== "win32" || process.arch !== "x64") throw new DomainError({
      code: "UNSUPPORTED",
      retryable: false,
      operation: "run:native",
      message: "Run currently requires Windows x64."
    });
    const binding = node_module.createRequire(__filename)(modulePath);
    if (binding.capability !== "student-ide-piped-job-v1") throw new Error("Run native capability mismatch.");
    this.native = binding;
  }
  environment;
  native;
  create(run, observe) {
    if (run.shell !== false || run.args.length !== 1 || Object.keys(run.environmentAdditions).length !== 0) {
      throw new Error("Unsupported Run execution preparation.");
    }
    const environment = Object.entries(this.environment).filter(([key, value]) => value !== void 0 && !/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE)$/i.test(key) && !key.includes("=") && !key.includes("\0") && !value.includes("\0")).sort(([a], [b]) => a.toUpperCase().localeCompare(b.toUpperCase())).map(([key, value]) => `${key}=${value}`);
    const stdout = new node_string_decoder.StringDecoder("utf8"), stderr = new node_string_decoder.StringDecoder("utf8");
    let resolveSettled;
    const settled = new Promise((resolve) => {
      resolveSettled = resolve;
    });
    let rootObserved = false, stdoutEof = false, stderrEof = false, released = false;
    let observationFailed = false;
    const emit = (event) => {
      try {
        observe(event);
      } catch {
        observationFailed = true;
      }
    };
    const handle = this.native.create(run.executable, run.args[0], run.cwd, environment, (event) => {
      if (released) return;
      if (event.type === "stdout" || event.type === "stderr") {
        const data = (event.type === "stdout" ? stdout : stderr).write(event.data);
        if (data) emit({ type: event.type, data });
      } else if (event.type === "stdout-eof" || event.type === "stderr-eof") {
        const isOut = event.type === "stdout-eof";
        const data = (isOut ? stdout : stderr).end();
        if (data) emit({ type: isOut ? "stdout" : "stderr", data });
        if (isOut) stdoutEof = true;
        else stderrEof = true;
        emit({ type: event.type });
      } else if (event.type === "exit") {
        rootObserved = true;
        emit(event);
      } else if (event.type === "settled") {
        resolveSettled();
      } else {
        observationFailed = true;
        emit({ type: "error", message: "Run process observation failed." });
      }
    });
    const job = {
      token: `run-job_${node_crypto.randomUUID()}`,
      activeProcessCount: () => Number(this.native.control(handle, "count")),
      terminate: () => {
        this.native.control(handle, "terminate");
      },
      release: () => {
        if (!rootObserved || !stdoutEof || !stderrEof) throw new Error("Run observers have not settled.");
        this.native.control(handle, "release");
        released = true;
      },
      isReleased: () => released
    };
    const ownership = { mode: "JOB_OWNED", rootPid: Number(this.native.control(handle, "pid")), job };
    const terminator = new WindowsProcessTreeTerminator();
    let closing;
    return {
      ownership,
      settled,
      isReleased: () => released,
      close: () => {
        if (released) return Promise.resolve();
        if (closing) return closing;
        closing = (async () => {
          job.terminate();
          await boundedSettlement(settled);
          const identity2 = await terminator.capture(ownership);
          await terminator.terminate(identity2, () => !released);
          if (observationFailed) emit({ type: "error", message: "Run output could not be fully observed." });
        })().finally(() => {
          closing = void 0;
        });
        return closing;
      }
    };
  }
}
function boundedSettlement(settled) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Run observer cleanup timed out.")), 5e3);
    settled.then(() => {
      clearTimeout(timer);
      resolve();
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
const nodeProjectFileSystem = {
  mkdir: (path) => promises.mkdir(path),
  realpath: promises.realpath,
  rmdir: promises.rmdir,
  stat: promises.stat
};
class ProjectService {
  constructor(fileSystem = nodeProjectFileSystem, platform = process.platform, recentProjectStore, onListenerError = () => void 0) {
    this.fileSystem = fileSystem;
    this.platform = platform;
    this.recentProjectStore = recentProjectStore;
    this.onListenerError = onListenerError;
  }
  fileSystem;
  platform;
  recentProjectStore;
  onListenerError;
  name = "ProjectService";
  activeProject;
  transitionGuards = /* @__PURE__ */ new Set();
  listeners = /* @__PURE__ */ new Set();
  transitionSettledListeners = /* @__PURE__ */ new Set();
  transitionQueue = Promise.resolve();
  acceptingTransitions = true;
  transitionContext = new node_async_hooks.AsyncLocalStorage();
  openRoot(rootPath) {
    return this.runTransition("project:open", async () => {
      const transition = this.createTransition("switch");
      try {
        await this.approveTransition(transition);
        const project = await createProjectIdentity(
          rootPath,
          this.fileSystem,
          this.platform
        );
        await this.recordRecentProject(project);
        this.activeProject = project;
        this.notifyProjectChanged();
        return toPublicIdentity(project);
      } catch (error) {
        this.notifyTransitionFailed(transition);
        throw error;
      }
    });
  }
  createProject(parentPath, projectName) {
    return this.runTransition("project:create", async () => {
      validateProjectName(projectName, this.platform);
      const transition = this.createTransition("switch");
      try {
        await this.approveTransition(transition);
        const parent = await createProjectIdentity(
          parentPath,
          this.fileSystem,
          this.platform
        );
        const targetPath = this.platform === "win32" ? win32.join(parent.canonicalRoot, projectName) : node_path.join(parent.canonicalRoot, projectName);
        try {
          await this.fileSystem.mkdir(targetPath);
        } catch (error) {
          if (isNodeErrorCode(error, "EEXIST")) {
            throw new DomainError({
              code: "INVALID_INPUT",
              message: "A file or folder with that project name already exists.",
              operation: "project:create",
              retryable: false
            });
          }
          throw error;
        }
        try {
          return await this.activateCreatedRoot(targetPath);
        } catch (error) {
          await this.rollbackCreatedDirectory(targetPath, error);
          throw error;
        }
      } catch (error) {
        this.notifyTransitionFailed(transition);
        throw error;
      }
    });
  }
  getActiveProject() {
    return this.activeProject ? toPublicIdentity(this.activeProject) : null;
  }
  getAuthorizedProject(projectId) {
    if (!this.activeProject || this.activeProject.id !== projectId) {
      throw new DomainError({
        code: "PERMISSION_DENIED",
        message: "The project is no longer authorized.",
        operation: "project:authorize",
        retryable: false
      });
    }
    return this.activeProject;
  }
  listRecent() {
    return [...this.recentProjectStore?.getRecentProjects() ?? []].sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt)).map((p) => ({ id: p.id, name: p.name, displayPath: p.rootPath, lastOpenedAt: p.lastOpenedAt }));
  }
  openRecent(id2) {
    const entry = this.recentProjectStore?.getRecentProjects().find((p) => p.id === id2);
    if (!entry) return Promise.reject(new DomainError({ code: "NOT_FOUND", message: "This recent project is no longer listed. Open the folder again.", retryable: true }));
    return this.openRoot(entry.rootPath).catch((error) => {
      if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
        throw new DomainError({ code: "NOT_FOUND", message: "This project folder is missing. Restore it, open its new location, or remove it from recent projects.", retryable: true });
      }
      throw error;
    });
  }
  removeRecent(id2) {
    return this.runTransition("project:remove-recent", async () => {
      if (this.recentProjectStore) await this.recentProjectStore.updateRecentProjects(
        this.recentProjectStore.getRecentProjects().filter((p) => p.id !== id2)
      );
    });
  }
  closeProject() {
    return this.runTransition("project:close", async () => {
      if (!this.activeProject) {
        return;
      }
      const transition = this.createTransition("close");
      try {
        await this.approveTransition(transition);
        this.activeProject = void 0;
        this.notifyProjectChanged();
      } catch (error) {
        this.notifyTransitionFailed(transition);
        throw error;
      }
    });
  }
  registerTransitionGuard(guard) {
    this.transitionGuards.add(guard);
    return () => {
      this.transitionGuards.delete(guard);
    };
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  subscribeTransitionSettled(listener) {
    this.transitionSettledListeners.add(listener);
    return () => {
      this.transitionSettledListeners.delete(listener);
    };
  }
  stop() {
    this.acceptingTransitions = false;
    return this.enqueueTransition(async () => {
      this.activeProject = void 0;
      this.transitionGuards.clear();
      this.listeners.clear();
      this.transitionSettledListeners.clear();
    });
  }
  async activateCreatedRoot(targetPath) {
    const project = await createProjectIdentity(
      targetPath,
      this.fileSystem,
      this.platform
    );
    await this.recordRecentProject(project);
    this.activeProject = project;
    this.notifyProjectChanged();
    return toPublicIdentity(project);
  }
  createTransition(reason) {
    if (!this.activeProject) {
      return null;
    }
    return {
      transitionId: node_crypto.randomUUID(),
      reason,
      currentProject: toPublicIdentity(this.activeProject)
    };
  }
  async approveTransition(transition) {
    if (!transition) return;
    for (const guard of this.transitionGuards) {
      if (!await guard(transition)) {
        throw new DomainError({
          code: "PROCESS_CANCELLED",
          message: "The project transition was cancelled.",
          operation: `project:${transition.reason}`,
          retryable: false
        });
      }
    }
  }
  async recordRecentProject(project) {
    if (!this.recentProjectStore) {
      return;
    }
    const recent = this.recentProjectStore.getRecentProjects().filter((item) => item.id !== project.id);
    await this.recentProjectStore.updateRecentProjects([{
      id: project.id,
      name: project.name,
      rootPath: project.canonicalRoot,
      lastOpenedAt: (/* @__PURE__ */ new Date()).toISOString()
    }, ...recent]);
  }
  async rollbackCreatedDirectory(targetPath, originalError) {
    try {
      await this.fileSystem.rmdir(targetPath);
    } catch (cleanupError) {
      throw new DomainError({
        code: "INTERNAL_ERROR",
        message: "Project creation failed and its empty directory could not be rolled back safely.",
        operation: "project:create",
        details: { rollback: "failed" },
        retryable: false
      }, {
        cause: new AggregateError(
          [originalError, cleanupError],
          "Project creation and safe rollback failed"
        )
      });
    }
  }
  runTransition(operation, transition) {
    if (this.transitionContext.getStore()) {
      return Promise.reject(new DomainError({
        code: "PROCESS_CANCELLED",
        message: "A project transition cannot start from inside another transition.",
        operation,
        retryable: false
      }));
    }
    if (!this.acceptingTransitions) {
      return Promise.reject(transitionUnavailable(operation));
    }
    return this.enqueueTransition(() => this.transitionContext.run(
      true,
      async () => {
        if (!this.acceptingTransitions) {
          throw transitionUnavailable(operation);
        }
        return transition();
      }
    ));
  }
  enqueueTransition(transition) {
    const result = this.transitionQueue.then(transition, transition);
    this.transitionQueue = result.then(
      () => void 0,
      () => void 0
    );
    return result;
  }
  notifyProjectChanged() {
    const project = this.getActiveProject();
    for (const listener of this.listeners) {
      try {
        listener(project);
      } catch (error) {
        this.onListenerError(error);
      }
    }
  }
  notifyTransitionFailed(transition) {
    if (!transition) return;
    for (const listener of this.transitionSettledListeners) {
      try {
        listener(transition.transitionId);
      } catch (error) {
        this.onListenerError(error);
      }
    }
  }
}
function validateProjectName(name, platform) {
  const invalid2 = name.length === 0 || name === "." || name === ".." || name.includes("\0") || name.includes("/") || name.includes("\\") || platform === "win32" && isInvalidWindowsName(name);
  if (invalid2) {
    throw new DomainError({
      code: "INVALID_INPUT",
      message: "The project name is invalid.",
      operation: "project:create",
      retryable: false
    });
  }
}
function isInvalidWindowsName(name) {
  const baseName = name.split(".")[0]?.toUpperCase() ?? "";
  return /[<>:"|?*]/.test(name) || /[. ]$/.test(name) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(baseName);
}
function toPublicIdentity(project) {
  return { id: project.id, name: project.name };
}
function isNodeErrorCode(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}
function transitionUnavailable(operation) {
  return new DomainError({
    code: "PROCESS_CANCELLED",
    message: "Project transitions are no longer available.",
    operation,
    retryable: false
  });
}
function isProjectId(value) {
  return typeof value === "string" && /^project_[a-f0-9]{24}$/.test(value);
}
const TERMINAL_LIMITS = {
  minimumDimension: 1,
  maximumDimension: 1e3,
  maximumInputBytes: 64 * 1024,
  maximumSessionIdLength: 128
};
const ALLOWED_TRANSITIONS = {
  CREATING: ["RUNNING", "FAILED"],
  RUNNING: ["CLOSING", "EXITED", "FAILED"],
  CLOSING: ["EXITED", "FAILED"],
  EXITED: [],
  FAILED: []
};
function canTransitionTerminalSession(from, to) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
function isTerminalSessionId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= TERMINAL_LIMITS.maximumSessionIdLength && /^[a-zA-Z0-9_-]+$/.test(value);
}
function validateCreateTerminalRequest(value) {
  const object = validateExactObject(value, ["projectId", "cols", "rows"]);
  if (!object.ok) return object;
  const issues = [];
  validateProjectIdField(object.value.projectId, issues);
  validateDimensions(object.value.cols, object.value.rows, issues);
  return issues.length > 0 ? { ok: false, issues } : {
    ok: true,
    value: {
      projectId: object.value.projectId,
      cols: object.value.cols,
      rows: object.value.rows
    }
  };
}
function validateTerminalInputRequest(value) {
  const object = validateExactObject(value, ["sessionId", "data"]);
  if (!object.ok) return object;
  const issues = [];
  validateSessionIdField(object.value.sessionId, issues);
  const data = object.value.data;
  if (typeof data !== "string") {
    issues.push({ path: "$.data", message: "Expected a string" });
  } else if (data.length === 0) {
    issues.push({ path: "$.data", message: "Expected non-empty terminal input" });
  } else if (utf8ByteLength(data) > TERMINAL_LIMITS.maximumInputBytes) {
    issues.push({ path: "$.data", message: "Terminal input exceeds the UTF-8 byte limit" });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: object.value };
}
function validateResizeTerminalRequest(value) {
  const object = validateExactObject(value, ["sessionId", "cols", "rows"]);
  if (!object.ok) return object;
  const issues = [];
  validateSessionIdField(object.value.sessionId, issues);
  validateDimensions(object.value.cols, object.value.rows, issues);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: object.value };
}
function validateCloseTerminalRequest(value) {
  const object = validateExactObject(value, ["sessionId"]);
  if (!object.ok) return object;
  const issues = [];
  validateSessionIdField(object.value.sessionId, issues);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: object.value };
}
function validateSessionIdField(value, issues) {
  if (!isTerminalSessionId(value)) {
    issues.push({ path: "$.sessionId", message: "Expected a valid terminal session ID" });
  }
}
function validateProjectIdField(value, issues) {
  if (!isProjectId(value)) {
    issues.push({ path: "$.projectId", message: "Expected a valid ProjectId" });
  }
}
function validateDimensions(cols, rows, issues) {
  validateDimension(cols, "$.cols", issues);
  validateDimension(rows, "$.rows", issues);
}
function validateDimension(value, path, issues) {
  if (!Number.isInteger(value) || value < TERMINAL_LIMITS.minimumDimension || value > TERMINAL_LIMITS.maximumDimension) {
    issues.push({
      path,
      message: `Expected an integer from ${TERMINAL_LIMITS.minimumDimension} to ${TERMINAL_LIMITS.maximumDimension}`
    });
  }
}
function utf8ByteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}
function createPtyEnvironment(environment) {
  const sanitized = {};
  for (const [name, value] of Object.entries(environment)) {
    if (value !== void 0) sanitized[name] = value;
  }
  return sanitized;
}
const systemTerminalScheduler = {
  schedule(callback, delayMilliseconds) {
    const handle = setTimeout(callback, delayMilliseconds);
    handle.unref?.();
    return {
      cancel() {
        clearTimeout(handle);
      }
    };
  }
};
const DEFAULT_BATCH_DELAY_MILLISECONDS = 8;
const DEFAULT_MAXIMUM_BATCH_BYTES = 64 * 1024;
const DEFAULT_CLOSE_TIMEOUT_MILLISECONDS = 2e3;
const DEFAULT_TOMBSTONE_LIMIT = 256;
class TerminalService {
  constructor(options) {
    this.options = options;
    this.scheduler = options.scheduler ?? systemTerminalScheduler;
    this.createSessionId = options.createSessionId ?? (() => `terminal_${node_crypto.randomUUID()}`);
    this.batchDelayMilliseconds = positiveInteger(
      options.batchDelayMilliseconds,
      DEFAULT_BATCH_DELAY_MILLISECONDS
    );
    this.maximumBatchBytes = positiveInteger(
      options.maximumBatchBytes,
      DEFAULT_MAXIMUM_BATCH_BYTES
    );
    this.closeTimeoutMilliseconds = positiveInteger(
      options.closeTimeoutMilliseconds,
      DEFAULT_CLOSE_TIMEOUT_MILLISECONDS
    );
    this.tombstoneLimit = positiveInteger(
      options.tombstoneLimit,
      DEFAULT_TOMBSTONE_LIMIT
    );
  }
  options;
  name = "TerminalService";
  sessions = /* @__PURE__ */ new Map();
  pendingCreates = /* @__PURE__ */ new Set();
  blockedProjects = /* @__PURE__ */ new Map();
  blockedOwners = /* @__PURE__ */ new Map();
  tombstones = [];
  scheduler;
  createSessionId;
  batchDelayMilliseconds;
  maximumBatchBytes;
  closeTimeoutMilliseconds;
  tombstoneLimit;
  started = false;
  start() {
    this.started = true;
  }
  async stop() {
    this.started = false;
    await this.shutdownAll();
    this.sessions.clear();
    this.tombstones.length = 0;
  }
  async create(request, context) {
    this.ensureStarted("terminal:create");
    assertValid(validateCreateTerminalRequest(request), "terminal:create");
    this.validateContext(context, request.projectId, "terminal:create");
    this.ensureCreateAllowed(request.projectId, context.ownerWebContentsId);
    const pending = createPendingCreate(request.projectId, context.ownerWebContentsId);
    this.pendingCreates.add(pending);
    try {
      return await this.createTracked(request, context);
    } finally {
      this.pendingCreates.delete(pending);
      pending.complete();
    }
  }
  async createTracked(request, context) {
    this.options.projectService.getAuthorizedProject(request.projectId);
    const shell = await this.options.shellResolver.resolve();
    this.ensureStarted("terminal:create");
    this.ensureCreateAllowed(request.projectId, context.ownerWebContentsId);
    const project = this.options.projectService.getAuthorizedProject(request.projectId);
    const sessionId = this.generateSessionId();
    let pty;
    try {
      pty = this.options.ptyPort.spawn({
        executable: shell.executable,
        args: shell.args,
        cwd: project.canonicalRoot,
        env: createPtyEnvironment(this.options.environment ?? process.env),
        cols: request.cols,
        rows: request.rows,
        name: "xterm-256color"
      });
    } catch (error) {
      throw spawnFailure(error);
    }
    const record = {
      sessionId,
      ownerWebContentsId: context.ownerWebContentsId,
      projectId: project.id,
      cwd: project.canonicalRoot,
      shellLabel: shell.shellLabel,
      cols: request.cols,
      rows: request.rows,
      state: "CREATING",
      pty,
      processTreeIdentity: void 0,
      nextSequence: 0,
      queuedData: "",
      queuedBytes: 0,
      batchTask: void 0,
      dataSubscription: void 0,
      exitSubscription: void 0,
      unregisterResource: void 0,
      completion: deferredCompletion(),
      pendingCreatingExit: void 0,
      rootExit: void 0,
      creatingOutputOverflow: false,
      closeRequested: false,
      terminationTask: void 0,
      treeTerminationComplete: false,
      exitEmitted: false,
      errorEmitted: false,
      failure: void 0
    };
    this.sessions.set(sessionId, record);
    try {
      record.dataSubscription = pty.onData((data) => this.handleData(record, data));
      record.exitSubscription = pty.onExit((event) => this.handleExit(record, event));
      record.processTreeIdentity = await this.options.processTreeTerminator.capture(
        pty.processTreeOwnership
      );
      if (record.pendingCreatingExit) {
        throw new Error("The terminal process exited during creation.");
      }
      if (record.creatingOutputOverflow) {
        throw new Error("The terminal emitted excessive output during creation.");
      }
      record.unregisterResource = this.options.processManager.register({
        id: resourceId(sessionId),
        ownerId: processOwnerId(context.ownerWebContentsId),
        close: () => this.closeOwnedRecord(record)
      });
      this.transition(record, "RUNNING");
      if (record.queuedBytes > 0) this.scheduleBatch(record);
    } catch (error) {
      let cleanupError;
      try {
        await this.cleanupPartialCreate(record);
      } catch (candidate) {
        cleanupError = candidate;
      }
      const code = error instanceof Error && error.message.includes("already registered") ? "SERVICE_CRASHED" : "PROCESS_FAILED";
      throw new DomainError({
        code,
        message: code === "SERVICE_CRASHED" ? "Terminal resource registration failed." : "The terminal process failed during creation.",
        operation: "terminal:create",
        retryable: false
      }, {
        cause: cleanupError === void 0 ? error : new AggregateError(
          [error, cleanupError],
          "Terminal creation and fail-closed cleanup both failed."
        )
      });
    }
    return {
      sessionId,
      projectId: project.id,
      state: "RUNNING",
      cols: record.cols,
      rows: record.rows,
      shellLabel: record.shellLabel
    };
  }
  input(request, context) {
    this.ensureStarted("terminal:input");
    assertValid(validateTerminalInputRequest(request), "terminal:input");
    const record = this.authorize(request.sessionId, context, "terminal:input");
    this.requireRunning(record, "terminal:input");
    try {
      record.pty?.write(request.data);
    } catch (error) {
      const failure2 = processFailure(
        "terminal:input",
        "The terminal process rejected input.",
        error
      );
      this.failRecord(record, failure2, true);
      throw failure2;
    }
  }
  resize(request, context) {
    this.ensureStarted("terminal:resize");
    assertValid(validateResizeTerminalRequest(request), "terminal:resize");
    const record = this.authorize(request.sessionId, context, "terminal:resize");
    this.requireRunning(record, "terminal:resize");
    if (record.cols === request.cols && record.rows === request.rows) return;
    try {
      record.pty?.resize(request.cols, request.rows);
    } catch (error) {
      const failure2 = processFailure(
        "terminal:resize",
        "The terminal process could not be resized.",
        error
      );
      this.failRecord(record, failure2, true);
      throw failure2;
    }
    record.cols = request.cols;
    record.rows = request.rows;
  }
  async close(request, context) {
    this.ensureStarted("terminal:close");
    assertValid(validateCloseTerminalRequest(request), "terminal:close");
    const record = this.authorize(request.sessionId, context, "terminal:close");
    const firstClose = record.state === "RUNNING";
    await this.requestClose(record, "terminal:close");
    return { status: firstClose ? "closed" : "already-closed" };
  }
  hasLiveSessionsForProject(projectId) {
    return [...this.sessions.values()].some(
      (record) => record.projectId === projectId && record.pty !== null
    );
  }
  async acquireProjectTransition(projectId) {
    if (!isProjectId(projectId)) {
      throw invalidInputError("terminal:project-transition", ["$.projectId"]);
    }
    this.blockScope(this.blockedProjects, projectId);
    let released = false;
    try {
      await this.waitForPendingCreates(
        (pending) => pending.projectId === projectId
      );
    } catch (error) {
      this.unblockScope(this.blockedProjects, projectId);
      throw error;
    }
    return {
      hasLiveSessions: this.hasLiveSessionsForProject(projectId),
      closeSessions: () => this.closeSessionsForProject(projectId),
      release: () => {
        if (released) return;
        released = true;
        this.unblockScope(this.blockedProjects, projectId);
      }
    };
  }
  getSessionSnapshot(sessionId) {
    const record = this.sessions.get(sessionId);
    return record ? snapshot(record) : null;
  }
  listSessionsForProject(projectId) {
    return [...this.sessions.values()].filter((record) => record.projectId === projectId).map(snapshot);
  }
  async closeSessionsForOwner(ownerWebContentsId) {
    this.blockScope(this.blockedOwners, ownerWebContentsId);
    try {
      await this.waitForPendingCreates(
        (pending) => pending.ownerWebContentsId === ownerWebContentsId
      );
      await this.closeRecords(
        [...this.sessions.values()].filter(
          (record) => record.ownerWebContentsId === ownerWebContentsId && record.pty !== null
        ),
        "terminal:close-owner"
      );
    } finally {
      this.unblockScope(this.blockedOwners, ownerWebContentsId);
    }
  }
  async closeSessionsForProject(projectId) {
    this.blockScope(this.blockedProjects, projectId);
    try {
      await this.waitForPendingCreates((pending) => pending.projectId === projectId);
      await this.closeRecords(
        [...this.sessions.values()].filter(
          (record) => record.projectId === projectId && record.pty !== null
        ),
        "terminal:close-project"
      );
    } finally {
      this.unblockScope(this.blockedProjects, projectId);
    }
  }
  async shutdownAll() {
    this.started = false;
    await this.waitForPendingCreates(() => true);
    await this.closeRecords(
      [...this.sessions.values()].filter((record) => record.pty !== null),
      "terminal:shutdown"
    );
  }
  async closeRecords(records, operation) {
    const errors = [];
    for (const record of records) {
      try {
        await this.requestClose(record, operation);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more terminal sessions failed to close.");
    }
  }
  async requestClose(record, operation) {
    if (record.pty === null) return;
    if (record.state === "RUNNING") this.transition(record, "CLOSING");
    if (record.state === "CREATING") {
      throw serviceInvariant("A creating terminal cannot be closed publicly.", operation);
    }
    if (!record.terminationTask) {
      record.terminationTask = this.terminateOwnedTree(record, operation);
    }
    await record.terminationTask;
    const completion = await this.waitForCompletion(record);
    if (!completion) {
      throw processFailure(
        operation,
        "Timed out waiting for the terminal process to exit."
      );
    }
  }
  closeOwnedRecord(record) {
    return this.requestClose(record, "terminal:owned-cleanup");
  }
  async terminateOwnedTree(record, operation) {
    const pty = record.pty;
    const identity2 = record.processTreeIdentity;
    if (!pty || !identity2 || identity2.rootPid !== pty.pid) {
      const failure2 = processFailure(
        operation,
        "The terminal process identity is unavailable for safe cleanup."
      );
      this.failRecord(record, failure2, false);
      record.terminationTask = void 0;
      throw failure2;
    }
    try {
      await this.options.processTreeTerminator.terminate(
        identity2,
        (candidate) => this.stillOwnsIdentity(record, pty, candidate)
      );
      record.treeTerminationComplete = true;
      pty.close();
      record.closeRequested = true;
      if (record.rootExit && record.pty !== null) {
        this.finalizeExit(record, record.rootExit);
      }
    } catch (error) {
      const failure2 = processFailure(
        operation,
        "The owned terminal process tree could not be closed safely.",
        error
      );
      this.failRecord(record, failure2, false);
      record.terminationTask = void 0;
      throw failure2;
    }
  }
  stillOwnsIdentity(record, pty, identity2) {
    const recordedIdentity = record.processTreeIdentity;
    return this.sessions.get(record.sessionId) === record && record.pty === pty && pty.pid === identity2.rootPid && recordedIdentity === identity2 && (identity2.mode === "LEGACY_ROOT_OWNED" || pty.processTreeOwnership.mode === "JOB_OWNED" && pty.processTreeOwnership.job.token === identity2.token) && (record.state === "CLOSING" || record.state === "FAILED");
  }
  waitForCompletion(record) {
    return new Promise((resolve) => {
      let settled = false;
      const timeout = this.scheduler.schedule(() => {
        if (settled) return;
        settled = true;
        resolve(null);
      }, this.closeTimeoutMilliseconds);
      void record.completion.promise.then((completion) => {
        if (settled) return;
        settled = true;
        timeout.cancel();
        resolve(completion);
      });
    });
  }
  authorize(sessionId, context, operation) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new DomainError({
        code: "NOT_FOUND",
        message: "The terminal session was not found.",
        operation,
        retryable: false
      });
    }
    this.validateContext(context, record.projectId, operation);
    if (record.ownerWebContentsId !== context.ownerWebContentsId) {
      throw permissionDenied(operation);
    }
    this.options.projectService.getAuthorizedProject(context.projectId);
    return record;
  }
  validateContext(context, expectedProjectId, operation) {
    if (!Number.isSafeInteger(context.ownerWebContentsId) || context.ownerWebContentsId <= 0 || !isProjectId(context.projectId)) {
      throw new DomainError({
        code: "INVALID_INPUT",
        message: "The terminal ownership context is invalid.",
        operation,
        retryable: false
      });
    }
    if (context.projectId !== expectedProjectId) throw permissionDenied(operation);
  }
  requireRunning(record, operation) {
    if (record.state !== "RUNNING" || !record.pty) {
      throw processFailure(operation, "The terminal session is not running.");
    }
  }
  handleData(record, data) {
    if (!data || record.pty === null) return;
    if (record.state !== "CREATING" && record.state !== "RUNNING" && record.state !== "CLOSING") {
      return;
    }
    for (const part of splitUtf8(data, this.maximumBatchBytes)) {
      const bytes = Buffer.byteLength(part, "utf8");
      if (record.state === "CREATING" && record.queuedBytes + bytes > this.maximumBatchBytes) {
        record.creatingOutputOverflow = true;
        return;
      }
      if (record.queuedBytes > 0 && record.queuedBytes + bytes > this.maximumBatchBytes) {
        this.flushOutput(record);
      }
      record.queuedData += part;
      record.queuedBytes += bytes;
      if (record.queuedBytes >= this.maximumBatchBytes && record.state !== "CREATING") {
        this.flushOutput(record);
      }
    }
    if (record.state !== "CREATING" && record.queuedBytes > 0) this.scheduleBatch(record);
  }
  scheduleBatch(record) {
    if (record.batchTask || record.queuedBytes === 0) return;
    record.batchTask = this.scheduler.schedule(() => {
      record.batchTask = void 0;
      if (record.state === "RUNNING" || record.state === "CLOSING") {
        this.flushOutput(record);
      }
    }, this.batchDelayMilliseconds);
  }
  flushOutput(record) {
    record.batchTask?.cancel();
    record.batchTask = void 0;
    if (record.queuedBytes === 0) return;
    const data = record.queuedData;
    record.queuedData = "";
    record.queuedBytes = 0;
    const sequence = record.nextSequence;
    record.nextSequence += 1;
    this.publish(record, {
      type: "data",
      sessionId: record.sessionId,
      projectId: record.projectId,
      sequence,
      data
    });
  }
  handleExit(record, event) {
    if (record.pty === null) return;
    if (record.state === "CREATING") {
      record.pendingCreatingExit = event;
      return;
    }
    if (record.state === "EXITED") return;
    if (record.state !== "RUNNING" && record.state !== "CLOSING" && record.state !== "FAILED") {
      return;
    }
    record.rootExit ??= event;
    if (record.treeTerminationComplete) {
      this.finalizeExit(record, record.rootExit);
      return;
    }
    if (record.state === "RUNNING") this.transition(record, "CLOSING");
    if (!record.terminationTask) {
      record.terminationTask = this.terminateOwnedTree(record, "terminal:natural-exit");
      void record.terminationTask.catch(() => void 0);
    }
  }
  finalizeExit(record, event) {
    if (!record.treeTerminationComplete) {
      throw serviceInvariant(
        "Terminal exit cannot finalize before process-tree cleanup.",
        "terminal:exit"
      );
    }
    this.flushOutput(record);
    if (record.state !== "FAILED" && record.state !== "EXITED") {
      this.transition(record, "EXITED");
    }
    this.releaseProcess(record);
    record.completion.resolve(record.state === "FAILED" ? { status: "failed", error: record.failure } : { status: "exited" });
    this.rememberTombstone(record);
    if (record.exitEmitted) return;
    record.exitEmitted = true;
    this.publish(record, {
      type: "exit",
      sessionId: record.sessionId,
      projectId: record.projectId,
      exitCode: event.exitCode,
      signal: event.signal
    });
  }
  failRecord(record, failure2, requestClose) {
    if (record.state === "EXITED" || record.state === "FAILED") return;
    this.flushOutput(record);
    this.transition(record, "FAILED");
    record.failure = failure2;
    this.cancelBatch(record);
    if (!record.errorEmitted) {
      record.errorEmitted = true;
      this.publish(record, {
        type: "error",
        sessionId: record.sessionId,
        projectId: record.projectId,
        error: serializeAppError(failure2)
      });
    }
    if (requestClose && record.pty && !record.closeRequested) {
      try {
        record.pty.close();
        record.closeRequested = true;
      } catch {
      }
    }
  }
  async cleanupPartialCreate(record) {
    const pty = record.pty;
    if (!pty) return;
    if (record.state === "CREATING") this.transition(record, "FAILED");
    record.processTreeIdentity ??= await this.options.processTreeTerminator.capture(
      pty.processTreeOwnership
    );
    try {
      await this.options.processTreeTerminator.terminate(
        record.processTreeIdentity,
        (candidate) => this.stillOwnsIdentity(record, pty, candidate)
      );
      record.treeTerminationComplete = true;
      pty.close();
      record.closeRequested = true;
    } catch (error) {
      if (!record.unregisterResource) {
        record.unregisterResource = this.options.processManager.register({
          id: recoveryResourceId(record.sessionId),
          ownerId: processOwnerId(record.ownerWebContentsId),
          close: () => this.closeOwnedRecord(record)
        });
      }
      record.terminationTask = void 0;
      throw error;
    }
    this.sessions.delete(record.sessionId);
    this.releaseProcess(record);
  }
  releaseProcess(record) {
    this.cancelBatch(record);
    record.dataSubscription?.dispose();
    record.dataSubscription = void 0;
    record.exitSubscription?.dispose();
    record.exitSubscription = void 0;
    record.unregisterResource?.();
    record.unregisterResource = void 0;
    record.processTreeIdentity = void 0;
    record.pty?.dispose();
    record.pty = null;
  }
  cancelBatch(record) {
    record.batchTask?.cancel();
    record.batchTask = void 0;
    record.queuedData = "";
    record.queuedBytes = 0;
  }
  rememberTombstone(record) {
    this.tombstones.push(record.sessionId);
    while (this.tombstones.length > this.tombstoneLimit) {
      const expired = this.tombstones.shift();
      if (expired) this.sessions.delete(expired);
    }
  }
  transition(record, next) {
    if (!canTransitionTerminalSession(record.state, next)) {
      throw serviceInvariant(
        `Invalid terminal transition ${record.state} -> ${next}.`,
        "terminal:transition"
      );
    }
    record.state = next;
  }
  publish(record, event) {
    try {
      this.options.publish(record.ownerWebContentsId, event);
    } catch (error) {
      this.options.onEventSinkError?.(error);
    }
  }
  generateSessionId() {
    const sessionId = this.createSessionId();
    if (!isTerminalSessionId(sessionId) || this.sessions.has(sessionId)) {
      throw serviceInvariant("Terminal session ID generation failed.", "terminal:create");
    }
    return sessionId;
  }
  ensureStarted(operation) {
    if (!this.started) {
      throw new DomainError({
        code: "SERVICE_CRASHED",
        message: "The terminal service is not available.",
        operation,
        retryable: true
      });
    }
  }
  ensureCreateAllowed(projectId, ownerWebContentsId) {
    if ((this.blockedProjects.get(projectId) ?? 0) > 0 || (this.blockedOwners.get(ownerWebContentsId) ?? 0) > 0) {
      throw new DomainError({
        code: "PROCESS_CANCELLED",
        message: "Terminal creation was cancelled by a lifecycle transition.",
        operation: "terminal:create",
        retryable: true
      });
    }
  }
  waitForPendingCreates(matches) {
    return Promise.all(
      [...this.pendingCreates].filter(matches).map((pending) => pending.completion)
    ).then(() => void 0);
  }
  blockScope(scopes, key) {
    scopes.set(key, (scopes.get(key) ?? 0) + 1);
  }
  unblockScope(scopes, key) {
    const count = scopes.get(key) ?? 0;
    if (count <= 1) scopes.delete(key);
    else scopes.set(key, count - 1);
  }
}
function createPendingCreate(projectId, ownerWebContentsId) {
  let complete = () => void 0;
  const completion = new Promise((resolve) => {
    complete = resolve;
  });
  return { projectId, ownerWebContentsId, completion, complete };
}
function assertValid(validation, operation) {
  if (!validation.ok) {
    throw invalidInputError(operation, validation.issues.map((issue) => issue.path));
  }
}
function permissionDenied(operation) {
  return new DomainError({
    code: "PERMISSION_DENIED",
    message: "The terminal session is owned by another renderer or project.",
    operation,
    retryable: false
  });
}
function processFailure(operation, message, cause) {
  return new DomainError({
    code: "PROCESS_FAILED",
    message,
    operation,
    retryable: false
  }, cause === void 0 ? void 0 : { cause });
}
function spawnFailure(error) {
  const nativeCode = error instanceof Error && "code" in error ? String(error.code) : "";
  const nativeMessage = error instanceof Error ? error.message : "";
  const missingNativeDependency = nativeCode === "MODULE_NOT_FOUND" || nativeCode === "ERR_DLOPEN_FAILED" || /(?:conpty|pty)\.node|winpty\.dll/i.test(nativeMessage);
  return new DomainError({
    code: missingNativeDependency ? "DEPENDENCY_MISSING" : "PROCESS_FAILED",
    message: missingNativeDependency ? "The native terminal provider is unavailable." : "The terminal process could not be started.",
    operation: "terminal:create",
    retryable: false
  }, { cause: error });
}
function serviceInvariant(message, operation) {
  return new DomainError({
    code: "SERVICE_CRASHED",
    message,
    operation,
    retryable: false
  });
}
function deferredCompletion() {
  let resolvePromise = () => void 0;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  let resolved = false;
  return {
    promise,
    resolve(value) {
      if (resolved) return;
      resolved = true;
      resolvePromise(value);
    }
  };
}
function resourceId(sessionId) {
  return `terminal:${sessionId}`;
}
function recoveryResourceId(sessionId) {
  return `terminal-recovery:${sessionId}`;
}
function processOwnerId(ownerWebContentsId) {
  return `terminal-owner:${ownerWebContentsId}`;
}
function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
function snapshot(record) {
  return {
    sessionId: record.sessionId,
    ownerWebContentsId: record.ownerWebContentsId,
    projectId: record.projectId,
    shellLabel: record.shellLabel,
    cols: record.cols,
    rows: record.rows,
    state: record.state
  };
}
function splitUtf8(value, maximumBytes) {
  if (Buffer.byteLength(value, "utf8") <= maximumBytes) return [value];
  const parts = [];
  let current = "";
  let currentBytes = 0;
  for (const character of value) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (currentBytes + bytes > maximumBytes && current) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += character;
    currentBytes += bytes;
  }
  if (current) parts.push(current);
  return parts;
}
const MAXIMUM_EARLY_OUTPUT_BYTES = 64 * 1024;
const WINDOWS_JOB_CAPABILITY = "student-coding-ide-windows-job-v1";
class NodePtyPort {
  spawn(options) {
    if (process.platform === "win32") {
      const capability = nodePty__namespace.supportsWindowsJobOwnership?.();
      if (capability !== WINDOWS_JOB_CAPABILITY) {
        throw new Error("The patched Windows terminal ownership capability is unavailable.");
      }
    }
    const nativeProcess = nodePty__namespace.spawn(
      options.executable,
      [...options.args],
      {
        cwd: options.cwd,
        env: { ...options.env },
        cols: options.cols,
        rows: options.rows,
        name: options.name
      }
    );
    return new NodePtyProcessAdapter(nativeProcess);
  }
}
class NodePtyProcessAdapter {
  constructor(nativeProcess) {
    this.nativeProcess = nativeProcess;
    this.pid = nativeProcess.pid;
    if (process.platform === "win32") {
      const patchedProcess = nativeProcess;
      const job = createWindowsJobController(patchedProcess);
      this.processTreeOwnership = {
        mode: "JOB_OWNED",
        rootPid: this.pid,
        job
      };
    } else {
      this.processTreeOwnership = {
        mode: "LEGACY_ROOT_OWNED",
        rootPid: this.pid
      };
    }
    this.nativeDataSubscription = nativeProcess.onData((data) => {
      if (this.disposed || this.exited) return;
      if (this.dataListeners.size === 0) {
        const bytes = Buffer.byteLength(data, "utf8");
        if (this.pendingDataBytes + bytes > MAXIMUM_EARLY_OUTPUT_BYTES) {
          this.earlyOutputFailure = new Error(
            "PTY emitted too much output before its data listener was attached."
          );
          return;
        }
        this.pendingData.push(data);
        this.pendingDataBytes += bytes;
        return;
      }
      for (const listener of [...this.dataListeners]) listener(data);
    });
    this.nativeExitSubscription = nativeProcess.onExit((event) => {
      if (this.disposed || this.exited) return;
      this.exited = true;
      const normalized = {
        exitCode: Number.isSafeInteger(event.exitCode) ? event.exitCode : null,
        signal: Number.isSafeInteger(event.signal) ? event.signal ?? null : null
      };
      if (this.exitListeners.size === 0) {
        this.pendingExit = normalized;
        return;
      }
      for (const listener of [...this.exitListeners]) listener(normalized);
    });
  }
  nativeProcess;
  pid;
  processTreeOwnership;
  dataListeners = /* @__PURE__ */ new Set();
  exitListeners = /* @__PURE__ */ new Set();
  pendingData = [];
  pendingDataBytes = 0;
  pendingExit;
  earlyOutputFailure;
  closeRequested = false;
  disposed = false;
  exited = false;
  nativeDataSubscription;
  nativeExitSubscription;
  write(data) {
    this.assertUsable();
    this.nativeProcess.write(data);
  }
  resize(cols, rows) {
    this.assertUsable();
    this.nativeProcess.resize(cols, rows);
  }
  close() {
    if (this.closeRequested || this.disposed) return;
    if (this.processTreeOwnership.mode === "JOB_OWNED") {
      if (!this.processTreeOwnership.job.isReleased()) {
        throw new Error("The Windows terminal Job must be finalized before PTY disposal.");
      }
      this.nativeProcess.kill();
      this.closeRequested = true;
      return;
    }
    if (this.exited) return;
    this.nativeProcess.kill();
    this.closeRequested = true;
  }
  onData(listener) {
    this.assertNotDisposed();
    if (this.earlyOutputFailure) throw this.earlyOutputFailure;
    this.dataListeners.add(listener);
    for (const data of this.pendingData.splice(0)) listener(data);
    this.pendingDataBytes = 0;
    return subscription(() => this.dataListeners.delete(listener));
  }
  onExit(listener) {
    this.assertNotDisposed();
    this.exitListeners.add(listener);
    if (this.pendingExit) {
      const event = this.pendingExit;
      this.pendingExit = void 0;
      listener(event);
    }
    return subscription(() => this.exitListeners.delete(listener));
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.nativeDataSubscription.dispose();
    this.nativeExitSubscription.dispose();
    this.dataListeners.clear();
    this.exitListeners.clear();
    this.pendingData.length = 0;
    this.pendingDataBytes = 0;
    this.pendingExit = void 0;
  }
  assertUsable() {
    this.assertNotDisposed();
    if (this.closeRequested || this.exited) {
      throw new Error("The PTY is no longer running.");
    }
  }
  assertNotDisposed() {
    if (this.disposed) throw new Error("The PTY adapter is disposed.");
  }
}
function createWindowsJobController(nativeProcess) {
  const token = nativeProcess.windowsJobToken;
  if (!token) throw new Error("The Windows terminal Job token is unavailable.");
  let released = false;
  let terminationRequested = false;
  return {
    token,
    activeProcessCount() {
      if (released) return 0;
      return nativeProcess.windowsJobActiveProcessCount();
    },
    terminate() {
      if (released || terminationRequested) return;
      nativeProcess.terminateWindowsJob();
      terminationRequested = true;
    },
    release() {
      if (released) return;
      nativeProcess.releaseWindowsJob();
      released = true;
    },
    isReleased: () => released
  };
}
function subscription(disposeListener) {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeListener();
    }
  };
}
const arg = (key) => process.argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const config = JSON.parse(node_fs.readFileSync(arg("config"), "utf8")), id = arg("variant"), caseRoot = arg("case-root");
const plan = config.plan, nativePath = node_path.join(config.output, "exercise-process.node"), native = node_module.createRequire(__filename)(nativePath);
const root = node_path.join(caseRoot, "learning"), sessions = [], samples = [], gates = [];
const r = { name: id, status: "PASS", started: (/* @__PURE__ */ new Date()).toISOString(), timeline: [], commands: [] };
const now = () => node_perf_hooks.performance.now(), mark = (event, extra = {}) => r.timeline.push({ event, monotonicMs: now(), ...extra });
const save = (path, value) => node_fs.writeFileSync(path, JSON.stringify(value, null, 2));
electron.app.setPath("userData", node_path.join(caseRoot, "userData"));
let sampler, isolation, sampleError;
function sample(s) {
  if (!s.handle || s.released) return;
  const memory2 = native.memory(s.handle), members = native.jobMembers(s.handle);
  const identities = [...s.records.values()].map(({ handle, ...p }) => p);
  const value = { at: now(), sessionId: s.sessionId, phase: s.phase, memory: memory2, members, identities };
  samples.push(value);
  node_fs.appendFileSync(node_path.join(caseRoot, "samples.jsonl"), JSON.stringify(value) + "\n");
}
async function session(quota) {
  const s = new PolicySession(root, nativePath);
  s.quota = quota;
  sessions.push(s);
  await s.prepare();
  return s;
}
async function launch(s, executable, args, phase = "execute") {
  native.configureMemory(s.quota);
  s.launchAt = now();
  r.commands.push({ sessionId: s.sessionId, executable, args, phase, quota: s.quota, launchAt: s.launchAt });
  await s.launch(executable, args, phase);
  const memory2 = native.memory(s.handle);
  assert.equal(memory2.quotaBytes, s.quota);
  assert.equal(memory2.configuredBeforeLaunch, s.quota);
  s.quotaReadback = memory2;
  sample(s);
}
async function seen(s) {
  s.scan();
  sample(s);
  await until(() => {
    const path = node_path.join(caseRoot, "retained.json");
    if (!node_fs.existsSync(path)) return false;
    let retained;
    try {
      retained = JSON.parse(node_fs.readFileSync(path, "utf8"));
    } catch {
      return false;
    }
    return [...s.records.values()].every((p) => retained.some((q) => q.pid === p.pid && q.created === p.created));
  }, plan.observationMs);
}
async function clean(s, failure2 = null) {
  const began = now();
  mark("cleanup-start", { sessionId: s.sessionId });
  if (failure2 === "terminate") native.setFault(3);
  if (failure2 === "finalized") s.faults.persistence = "FINALIZED";
  if (failure2) {
    await assert.rejects(s.close(plan.cleanupMs));
    r.failureState = s.summary();
    assert.equal(s.manager.size, 1);
    assert.equal(s.finalized, false);
    assert.equal(s.cleanupComplete, false);
    if (failure2 === "terminate") {
      assert.equal(s.released, false);
      assert.equal(s.disposition, "PROCESS_UNRESOLVED");
    } else {
      assert.equal(s.nativeStage, "HANDLES_CLOSED");
      assert.equal(s.lastError.kind, "PERSISTENCE");
      assert.equal(s.processClean, false);
    }
    if (isolation) await isolation.check("failure");
    const counters = { ...s.counters };
    native.setFault(0);
    s.faults = {};
    await s.close(plan.cleanupMs);
    if (failure2 === "finalized") for (const key of ["spawn", "query", "terminate", "release"]) assert.equal(s.counters[key], counters[key]);
    r.retry = { before: counters, after: { ...s.counters } };
  } else await s.close(plan.cleanupMs);
  const finished = now();
  assert.equal(s.finalized, true);
  assert.equal(s.manager.size, 0);
  assert.equal(s.nativeStage, "HANDLES_CLOSED");
  assert.deepEqual(s.beforeRelease, []);
  assert.ok(s.proof.allRetainedSignaled);
  const checkpoint = await readCheckpoint(s.recordPath, root);
  if (s.proof.kind === "VERIFIED") {
    assert.equal(checkpoint.checkpoint, "CLEANUP_COMPLETE");
    assert.equal(s.processClean, true);
    assert.equal(node_fs.existsSync(s.workspace), false);
  } else {
    assert.equal(s.proof.kind, "HISTORY_UNVERIFIED");
    assert.equal(s.processClean, false);
    assert.equal(checkpoint.workspaceState, "QUARANTINED");
  }
  r.cleanups ??= [];
  r.cleanups.push({ sessionId: s.sessionId, ms: finished - began, state: s.summary(), checkpoint });
  mark("cleanup-finished", { sessionId: s.sessionId, ms: finished - began });
}
async function setupIsolation() {
  const projectRoot = node_path.join(caseRoot, "project");
  await promises.mkdir(projectRoot);
  const source = 'setInterval(()=>console.log("project-live"),150)';
  await promises.writeFile(node_path.join(projectRoot, "live.js"), source);
  const projects = new ProjectService(), project = await projects.openRoot(projectRoot), manager = new ProcessManager(), runEvents = [], terminalEvents = [];
  const run = new RunService(
    { authorize: async (request) => ({ projectId: project.id, relativePath: request.relativePath, canonicalRoot: projectRoot, canonicalFile: node_path.join(projectRoot, request.relativePath) }), resolveRuntime: async () => ({ executable: config.node }) },
    { adapter: new WindowsPipedProcessAdapter2(node_path.join(config.repo, "out/main/native/run-process.node")), manager, onEvent: (_, e) => runEvents.push(e), onEventSinkError() {
    } }
  );
  const terminal = new TerminalService({
    ptyPort: new NodePtyPort(),
    projectService: projects,
    processManager: manager,
    processTreeTerminator: new WindowsProcessTreeTerminator(),
    shellResolver: { resolve: async () => ({ executable: node_path.join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"), args: ["-NoLogo", "-NoProfile"], shellLabel: "Windows PowerShell" }) },
    publish: (_, e) => terminalEvents.push(e)
  });
  terminal.start();
  const rs = await run.startRun({ projectId: project.id, relativePath: "live.js", dirty: false }, 77);
  const ts = await terminal.create({ projectId: project.id, cols: 80, rows: 24 }, { ownerWebContentsId: 77, projectId: project.id });
  const baseline = manager.size;
  assert.equal(baseline, 2);
  const checks = [];
  return { async check(tag) {
    assert.equal(manager.size, baseline);
    assert.equal(run.getSession(rs.sessionId, 77).state, "RUNNING");
    assert.equal(terminal.getSessionSnapshot(ts.sessionId)?.state, "RUNNING");
    const count = runEvents.filter((e) => e.type === "stdout").length, marker = `limits-${tag}`;
    await terminal.input({ sessionId: ts.sessionId, data: `Write-Output ('limits-'+'${tag}')\r` }, { ownerWebContentsId: 77, projectId: project.id });
    await until(() => terminalEvents.filter((e) => e.type === "data").map((e) => e.data).join("").includes(marker));
    await until(() => runEvents.filter((e) => e.type === "stdout").length > count);
    assert.equal(await promises.readFile(node_path.join(projectRoot, "live.js"), "utf8"), source);
    checks.push({ tag, at: now(), projectResources: manager.size, stdoutCount: runEvents.filter((e) => e.type === "stdout").length, terminalMarker: marker });
    r.isolation = { status: "PASS", runSession: rs.sessionId, terminalSession: ts.sessionId, checks };
  }, async stop() {
    await run.stop();
    await terminal.stop();
    await manager.stop();
    await projects.stop();
  } };
}
function jsSource(mode, gate) {
  const wait = `const fs=require('node:fs');console.log('RUNTIME_READY');const t=setInterval(()=>{if(!fs.existsSync('go'))return;clearInterval(t);console.log('CALL_START');`;
  const child = `const {spawn}=require('node:child_process');const c=spawn(${JSON.stringify(config.node)},['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore',windowsHide:true});c.unref();console.log('CHILD '+c.pid);`;
  const memory2 = `const blocks=[];for(let i=0;i<8;i++)blocks.push(Buffer.alloc(8*1024*1024,0x5a));globalThis.kept=blocks;const {spawn}=require('node:child_process');const c=spawn(${JSON.stringify(node_path.join(config.output, "allocator.exe"))},[${JSON.stringify(gate)},'320','hold'],{stdio:['ignore','inherit','inherit'],windowsHide:true});console.log('CHILD '+c.pid);`;
  const normal = `let total=0;for(let i=0;i<100000;i++)total+=i%7;console.log('RESULT '+total);const f=setInterval(()=>{if(fs.existsSync('finish')){clearInterval(f);process.exit(0)}},5);`;
  return wait + (mode === "normal" ? normal : mode === "memory" ? memory2 : child + "while(true){}") + "},5);";
}
function csSource(mode, gate) {
  const normal = 'long n=0;for(int i=0;i<100000;i++)n+=i%7;System.Console.WriteLine("RESULT "+n);while(!System.IO.File.Exists("finish"))System.Threading.Thread.Yield();';
  const loop = `var child=System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(${JSON.stringify(config.node)}) {UseShellExecute=false,CreateNoWindow=true,ArgumentList={"-e","setInterval(()=>{},1000)"}});System.Console.WriteLine("CHILD "+child!.Id);while(true){}`;
  const memory2 = `var blocks=new System.Collections.Generic.List<byte[]>();for(int i=0;i<8;i++){var b=new byte[8*1024*1024];System.Array.Fill(b,(byte)0x5a);blocks.Add(b);}var child=System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(${JSON.stringify(node_path.join(config.output, "allocator.exe"))}) {UseShellExecute=false,CreateNoWindow=true,ArgumentList={${JSON.stringify(gate)},"320","hold"}});System.Console.WriteLine("CHILD "+child!.Id);System.GC.KeepAlive(blocks);while(true){System.GC.KeepAlive(blocks);System.Threading.Thread.Yield();}`;
  return `class Program{static void Main(){System.Console.WriteLine("RUNTIME_READY");while(!System.IO.File.Exists("go"))System.Threading.Thread.Yield();System.Console.WriteLine("CALL_START");${mode === "normal" ? normal : mode === "memory" ? memory2 : loop}}}`;
}
async function compile(source, direct = false) {
  const s = await session(plan.compileQuotaBytes);
  s.environment = { ...process.env, DOTNET_CLI_HOME: node_path.join(s.workspace, "cli"), NUGET_PACKAGES: node_path.join(s.workspace, "packages"), DOTNET_CLI_TELEMETRY_OPTOUT: "1", MSBUILDDISABLENODEREUSE: "1", DOTNET_NOLOGO: "1", DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true" };
  await promises.writeFile(node_path.join(s.workspace, "global.json"), JSON.stringify({ sdk: { version: config.sdk, rollForward: "latestPatch", allowPrerelease: false } }));
  await promises.writeFile(node_path.join(s.workspace, "Program.cs"), source);
  let args;
  if (direct) {
    const packRoot = node_path.join(node_path.dirname(config.dotnet), "packs/Microsoft.NETCore.App.Ref");
    const version = (await promises.readdir(packRoot)).filter((v) => /^10\.\d+\.\d+$/.test(v)).sort((a, b) => a.localeCompare(b, void 0, { numeric: true })).at(-1);
    assert.ok(version);
    const refs = node_path.join(packRoot, version, "ref/net10.0");
    await promises.writeFile(node_path.join(s.workspace, "compile.rsp"), ["/nologo", "/target:exe", "/nostdlib+", "/out:Exercise.dll", ...(await promises.readdir(refs)).filter((f) => f.endsWith(".dll")).map((f) => `/reference:"${node_path.join(refs, f)}"`), "Program.cs"].join("\n"));
    args = ["exec", node_path.join(node_path.dirname(config.dotnet), "sdk", config.sdk, "Roslyn/bincore/csc.dll"), "@compile.rsp"];
  } else {
    await promises.writeFile(node_path.join(s.workspace, "NuGet.Config"), "<configuration><packageSources><clear /></packageSources></configuration>");
    await promises.writeFile(node_path.join(s.workspace, "Exercise.csproj"), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><UseSharedCompilation>false</UseSharedCompilation><NuGetAudit>false</NuGetAudit><ImportDirectoryBuildProps>false</ImportDirectoryBuildProps><ImportDirectoryBuildTargets>false</ImportDirectoryBuildTargets></PropertyGroup></Project>');
    args = ["build", node_path.join(s.workspace, "Exercise.csproj"), "-c", "Release", "--disable-build-servers", "-nodeReuse:false", "--configfile", node_path.join(s.workspace, "NuGet.Config")];
  }
  await launch(s, config.dotnet, args, "compile");
  if (direct) return s;
  await until(() => s.exitCode !== null, plan.compileMs);
  assert.equal(s.exitCode, 0, s.output);
  r.compileMs = now() - s.launchAt;
  const artifact = node_path.join(caseRoot, `artifact-${s.sessionId}`);
  await promises.cp(node_path.join(s.workspace, "bin/Release/net10.0"), artifact, { recursive: true });
  await clean(s);
  return node_path.join(artifact, "Exercise.dll");
}
async function runtime(mode, language, quota) {
  const name = `Local\\student-9d-${node_crypto.randomUUID()}`, gate = native.gate(name);
  gates.push(gate);
  const artifact = language === "csharp" ? await compile(csSource(mode, name)) : null;
  const s = await session(quota);
  s.gate = gate;
  if (language === "javascript") await promises.writeFile(node_path.join(s.workspace, "driver.cjs"), jsSource(mode, name));
  await launch(s, language === "csharp" ? config.dotnet : config.node, [artifact ?? node_path.join(s.workspace, "driver.cjs")]);
  await until(() => s.output.includes("RUNTIME_READY"), plan.probeMs);
  r.startupMs = now() - s.launchAt;
  await seen(s);
  s.callAt = now();
  await promises.writeFile(node_path.join(s.workspace, "go"), "go");
  return s;
}
async function deadline(s, phaseMs, operationMs = plan.operationMs, failure2 = null) {
  const phaseAt = s.launchAt + phaseMs, operationAt = s.launchAt + operationMs, due = Math.min(phaseAt, operationAt);
  const reason = operationAt < phaseAt ? "OPERATION_TIMEOUT" : s.phase === "compile" ? "COMPILE_TIMEOUT" : "EXECUTE_TIMEOUT";
  await until(() => now() >= due, Math.max(phaseMs, operationMs) + 1e3);
  r.timeout = { reason, due, requestedAt: now(), overshootMs: now() - due, phaseMs, operationMs };
  mark("cancellation-requested", r.timeout);
  s.scan();
  sample(s);
  if (s.phase === "compile" && s.exitCode !== null) {
    r.status = "NOT_OBSERVED";
    r.reason = "Compiler finished before timeout";
    await clean(s);
    return;
  }
  if (id.startsWith("T2")) {
    const pid = Number(/CHILD (\d+)/.exec(s.output)?.[1]);
    assert.ok(pid);
    assert.ok(native.jobMembers(s.handle).includes(pid));
  }
  assert.equal(native.waitState([...s.records.values()].find((p) => p.root).handle), "PENDING");
  if (id.startsWith("T3")) r.compiler = { pid: s.rootPid, command: r.commands.at(-1), liveAtCancellation: true };
  await clean(s, failure2);
  r.timeout.terminationConfirmedMs = now() - r.timeout.requestedAt;
}
async function memory(s, failure2 = null) {
  await until(() => /ALLOCATOR_READY/.test(s.output), plan.observationMs);
  await seen(s);
  native.signalGate(s.gate);
  await until(() => /ALLOC_DENIED|ALLOC_CEILING/.test(s.output), plan.observationMs);
  if (!/ALLOC_DENIED/.test(s.output)) await until(() => /ALLOC_DENIED/.test(s.output) || s.exitCode !== null, plan.observationMs);
  s.scan();
  sample(s);
  await seen(s);
  const denial = /ALLOC_DENIED (\d+) (\d+)/.exec(s.output);
  const memoryEvents = samples.filter((x) => x.sessionId === s.sessionId).flatMap((x) => x.memory.events).filter((e) => e.message === 10);
  r.memoryEvidence = { denial: denial ? { committedByAllocator: Number(denial[1]), win32Error: Number(denial[2]) } : null, memoryEvents, output: s.output };
  if (!denial || !memoryEvents.length) {
    r.status = "NOT_OBSERVED";
    r.reason = "No paired native allocation denial and Job-memory-limit event; runtime OOM/exit alone is insufficient";
  } else {
    assert.ok([8, 14, 1455, 1816].includes(Number(denial[2])), "Expected memory/quota allocation error");
    assert.ok(Number(denial[1]) < (id.startsWith("T4") ? 96 : 320) * 1024 * 1024);
    if (id === "T4-tree") assert.ok(/ALLOC_CHILD/.test(s.output));
  }
  r.cancellationAt = now();
  await clean(s, failure2);
}
async function execute() {
  if (/^T[256]/.test(id)) {
    isolation = await setupIsolation();
    await isolation.check("before");
  }
  if (id.startsWith("T1")) {
    const s = await runtime("normal", id.includes("csharp") ? "csharp" : "javascript", plan.executeQuotaBytes);
    const due = s.launchAt + plan.executeMs;
    await until(() => s.output.includes("RESULT "), Math.max(1, due - now()));
    assert.ok(s.output.includes("RESULT 299995"));
    r.executionMs = now() - s.callAt;
    r.launchToResultMs = now() - s.launchAt;
    assert.ok(now() <= due, "Normal runtime must finish within 2s from launch");
    sample(s);
    assert.ok(!samples.filter((x) => x.sessionId === s.sessionId).flatMap((x) => x.memory.events).some((e) => e.message === 10), "Normal execution must not hit Job memory limit");
    await promises.writeFile(node_path.join(s.workspace, "finish"), "finish");
    await until(() => s.exitCode !== null);
    assert.equal(s.exitCode, 0);
    await clean(s);
  } else if (id.startsWith("T2") || id === "T6-timeout-terminate") {
    const s = await runtime("loop", id.includes("csharp") ? "csharp" : "javascript", plan.executeQuotaBytes);
    await deadline(s, plan.executeMs, plan.operationMs, id.startsWith("T6") ? "terminate" : null);
  } else if (id.startsWith("T3")) {
    let source = "class Program{static void Main(){}}";
    for (let i = 0; i < 12e3; i++) source += `class C${i}{public static int F(int n)=>n+${i};}
`;
    const s = await compile(source, true);
    await seen(s);
    await deadline(s, plan.compileTimeoutTrialMs);
  } else if (id.startsWith("T4")) {
    const s = await session(plan.lowQuotaBytes), name = `Local\\student-9d-${node_crypto.randomUUID()}`;
    s.gate = native.gate(name);
    gates.push(s.gate);
    await launch(s, node_path.join(config.output, "allocator.exe"), [name, id === "T4-tree" ? "32" : "96", id === "T4-tree" ? "tree" : "hold"]);
    await memory(s);
  } else if (id.startsWith("T5") || id === "T6-memory-finalized") {
    const s = await runtime("memory", id.includes("csharp") ? "csharp" : "javascript", plan.runtimeTestQuotaBytes);
    await memory(s, id.startsWith("T6") ? "finalized" : null);
  } else if (id === "T7-phase" || id === "T7-operation") {
    const s = await runtime("loop", "javascript", plan.executeQuotaBytes);
    await deadline(s, id === "T7-phase" ? 500 : 2e3, id === "T7-phase" ? 1500 : 750);
    assert.equal(r.timeout.reason, id === "T7-phase" ? "EXECUTE_TIMEOUT" : "OPERATION_TIMEOUT");
  } else if (id === "T7-pending-io") {
    const s = await runtime("loop", "javascript", plan.executeQuotaBytes);
    let release, entered = false, complete = false;
    const io = new Promise((resolve) => {
      release = resolve;
    }), persist = s.persist.bind(s);
    s.persist = async (stage) => {
      if (stage === "FINALIZED") {
        entered = true;
        await io;
      }
      return persist(stage);
    };
    const start = now(), pending = s.close(plan.cleanupMs).then(() => {
      complete = true;
    });
    let timer;
    const caller = Promise.race([pending, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("CLEANUP_DEADLINE")), 200);
    })]);
    const rejected = assert.rejects(caller, /CLEANUP_DEADLINE/);
    await until(() => entered);
    assert.equal(s.close(), s.task);
    await rejected;
    clearTimeout(timer);
    assert.equal(complete, false);
    assert.equal(s.finalized, false);
    assert.equal(s.manager.size, 1);
    const record = await readCheckpoint(s.recordPath, root);
    assert.equal(record.checkpoint, "RELEASE_READY");
    r.pendingIO = {
      deadlineMs: 200,
      observedMs: now() - start,
      pendingRetained: true,
      underlyingPolicySessionRejectsAtDeadline: false,
      stage: s.nativeStage,
      record: record.checkpoint,
      limit: "Observer/caller detects timeout; unchanged PolicySession itself has no whole-cleanup pending-I/O deadline"
    };
    release();
    await pending;
    await clean(s);
  } else throw Error("Unknown variant");
  if (isolation) await isolation.check("after");
}
async function main() {
  await promises.mkdir(caseRoot, { recursive: true });
  await electron.app.whenReady();
  electron.app.on("window-all-closed", () => {
  });
  sampler = setInterval(() => {
    try {
      for (const s of sessions) sample(s);
    } catch (e) {
      sampleError ??= e;
    }
  }, plan.pollMs);
  try {
    await execute();
    if (sampleError) throw sampleError;
  } catch (e) {
    r.status = "FAIL";
    r.error = { message: e.message, stack: e.stack };
  } finally {
    clearInterval(sampler);
    native.setFault(0);
    for (const s of sessions) {
      try {
        await s.safety();
      } catch (e) {
        r.status = "FAIL";
        r.safetyError = e.message;
      }
    }
    if (isolation) {
      try {
        await isolation.stop();
      } catch (e) {
        r.status = "FAIL";
        r.isolationStopError = e.message;
      }
    }
    for (const gate of gates) native.closeHandle(gate);
    r.sessions = sessions.map((s) => ({ ...s.summary(), quotaReadback: s.quotaReadback }));
    r.memorySummary = sessions.map((s) => {
      const entries = samples.filter((x) => x.sessionId === s.sessionId);
      return {
        sessionId: s.sessionId,
        phase: s.phase,
        quota: s.quota,
        peakJobCommitBytes: Math.max(0, ...entries.map((x) => x.memory.peakJobCommitBytes)),
        maxReportedJobCommitBytes: Math.max(0, ...entries.map((x) => x.memory.jobCommitReportedBytes ?? 0)),
        samples: entries.length
      };
    });
    save(node_path.join(caseRoot, "result.json"), r);
    electron.app.exit(r.status === "FAIL" ? 1 : 0);
  }
}
void main().catch((e) => {
  save(node_path.join(caseRoot, "fatal.json"), { message: e.message, stack: e.stack });
  electron.app.exit(1);
});
