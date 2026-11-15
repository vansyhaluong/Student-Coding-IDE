# Exercise shutdown — independent 9D Common verification

**Current result: R5 policy-B native build FAIL; 0/21 functional slots executed.** See
[REPORT.md](REPORT.md) before executing anything. The user must authorize fixture
any cleanup correction and continuation. R4 confirms Job release and manager-zero
while the child handle is still unsignaled; the full Exercise cleanup happens to
finish later, after child termination in this sample. R3 remains FAIL, and no
blocked scenario was run. No production integration or cleanup change was made.

R5 is a separately authorized policy-B draft under `policy-b-*.ts/.mjs` and
`policy-b-plan.json`. It targets `out/exercise-shutdown-9d-common/policy-b/`, preserving
earlier native artifacts and evidence. Its native build failed before tests. A
malformed failedAssociation descriptor has an extra nullptr; correction/build
logging and continuation await user confirmation. Do not rerun automatically.

Recorded R4 command: `node spikes/exercise-shutdown-9d-common/run.mjs --r4`.
It runs root-first only, preserves instant acceptance, then passively observes
within the existing 12-second deadline. It does not run the remaining groups.

Sources and reviewed evidence live only in this directory. Generated C++/native,
bundles, fixture workspaces and isolated Electron userData live under
`out/exercise-shutdown-9d-common/`. No production build configuration is used.

Components:

- `build.mjs`: selectively materializes pinned argv/Job primitive from commit
  b4e23fabfa690201d179d93c1596af7849c3d5c0, adds Learning-only kill-on-close and
  native test controls, compiles with existing MSVC/Electron headers, bundles host.
- `native-test-helpers.inc`: operation-boundary fault injection, retained process
  observation handles and real Windows file-lock helper; test-only authority.
- `host.ts`: actual Electron browser/Main host, separate ProcessManager instance,
  imported unchanged lifecycle classes, fake Project shutdown services, Learning
  session/workspace experiment and pending real Project Run/Terminal isolation.
- `run.mjs`: external controller, dedicated child-host handles, integrity hashes,
  stop-on-first-failure and pending hard-crash tests. It never targets the live IDE.
- `evidence/`: preserved first-run results/log. Do not overwrite this evidence when
  a later continuation is authorized; archive new runs separately.

Commands used for the recorded run (not permission to rerun):

```powershell
node spikes/exercise-shutdown-9d-common/build.mjs
node spikes/exercise-shutdown-9d-common/build.mjs --js-only
node spikes/exercise-shutdown-9d-common/run.mjs
```

No dependency/runtime downloads. Installed Node24, SDK10, repository packages,
MSVC x64 and cached Electron headers/import library are prerequisites. Trial
timeouts are observations/fixtures, not approved production limits.
