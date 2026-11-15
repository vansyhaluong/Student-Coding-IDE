# M1-11 Option A — static prototypes

Two 1440 × 900 PNGs for visual approval only:

- `m1-11-prototype-main.png`: editor-titlebar target selector and Run/Stop,
  completed build/restore output followed by an executing program. Run is disabled
  while Stop remains available. The red stderr line is simulated program output,
  not a build failure.
- `m1-11-prototype-dialog.png`: independent, idle selection scenario after
  persistence recovery. App.csproj is a **user-picked draft radio choice**, not an
  automatically restored/authorized target. Use target would confirm it; the
  background still says Choose target. Current JavaScript file mode is shown but
  unavailable because the mock active document is Program.cs.

Source anchors: renderer `styles.css`, `App.tsx`, shared Button/Dialog,
EditorRunAction and OutputPanel; `../M1-11-UI-DESIGN.md`, Option A.
Preserved: Geist, current dark theme tokens, 36px shell titlebar, 24px status bar,
280px sidebars, center editor/output arrangement, compact tabs, 14px icons,
440px dialog, 18px dialog padding, 10px radius and 55% black backdrop.
Icons and editor syntax highlighting are static approximations, not live
Lucide/Monaco components. The sample code, project paths, logs, phase, language
service status and recovery message are fabricated demonstration data.

`prototype.html` is a standalone mockup; `render.cjs` uses the already-installed
Electron only to render it in a hidden window and capture PNGs. No production
modules, Run IPC, SDK, build/execute or source-guard logic are loaded. Buttons
are inert. No stdin, new dependency, tests or application build were added/run.
Both exported images were opened and visually checked. This does not constitute
visual verification of the actual running IDE or M1-11 implementation acceptance.

To regenerate from the repository root using existing dependencies:

```powershell
node_modules/electron/dist/electron.exe spikes/csharp-project-run/mockups/render.cjs
```

M1-11 remains NOT_STARTED. Production code is unchanged. No commit/push/merge.
