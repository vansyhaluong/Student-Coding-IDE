import { useCallback, useEffect, useState } from 'react'
import { type AppSettings, type DependencyGuidance, validateSettings } from '../../../../shared/contracts'
import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'
export function SettingsDialog({ value, recovered, error, onSave, onClose }: {
  value: AppSettings; recovered: boolean; error: string | null; onSave(value: AppSettings): Promise<boolean>; onClose(): void
}) {
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [dependencies, setDependencies] = useState<DependencyGuidance | null>(null)
  const [dependencyError, setDependencyError] = useState(false)
  useEffect(() => {
    let active = true
    void window.studentIde.settings.dependencies().then(r => {
      if (active) { if (r.ok) setDependencies(r.value); else setDependencyError(true) }
    }).catch(() => { if (active) setDependencyError(true) })
    return () => { active = false }
  }, [])
  const cancel = useCallback(() => { if (!busy) onClose() }, [busy, onClose])
  const valid = validateSettings(draft).ok
  return <Dialog title="Settings" onCancel={cancel} initialFocus="dialog"
    actions={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" disabled={busy || !valid}
      onClick={() => { setBusy(true); void onSave(draft).then(saved => { setBusy(false); if (saved) onClose() }) }}>Save settings</Button></>}>
    <div className="settings-content">
      {recovered && <p role="status">Application preferences were recovered from backup or defaults. Project files were not changed.</p>}
      {error && <p role="alert">{error}</p>}
      <label>Theme<select value={draft.theme} onChange={e => setDraft({ ...draft, theme: e.target.value as AppSettings['theme'] })}>
        <option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label>
      <label>Editor font size (px)<input type="number" min="8" max="40" step="1" value={Number.isNaN(draft.fontSize) ? '' : draft.fontSize}
        onChange={e => setDraft({ ...draft, fontSize: e.target.valueAsNumber })} /></label>
      {!valid && <p role="alert">Font size must be a whole number from 8 to 40.</p>}
      <label>Tab size<select value={draft.tabSize} onChange={e => setDraft({ ...draft, tabSize: Number(e.target.value) as 2 | 4 })}>
        <option value="2">2 spaces</option><option value="4">4 spaces</option></select></label>
      <label className="settings-check"><input type="checkbox" checked={draft.autoSave} onChange={e => setDraft({ ...draft, autoSave: e.target.checked })} />Auto Save</label>
      <p>Save after 1 second without edits. Save errors keep changes unsaved.</p>
      <h3>Keyboard shortcuts</h3>
      <dl className="settings-shortcuts">{[['Save (editor)', 'Ctrl+S'], ['Find (editor)', 'Ctrl+F'], ['New file', 'Ctrl+N'],
        ['Open project', 'Ctrl+O'], ['Terminal', 'Ctrl+Backquote'], ['Search project', 'Ctrl+Shift+F']].map(([name, keys]) => <div key={name}><dt>{name}</dt><dd>{keys}</dd></div>)}</dl>
      <p>Dialogs take priority. Terminal keeps its shortcuts except the terminal toggle.</p>
      <h3>Dependencies</h3>
      {dependencyError ? <p role="alert">Dependency status could not be checked. Reopen Settings to try again.</p> : !dependencies ? <p>Checking dependencies…</p>
        : (['node', 'git'] as const).map(key => <p key={key}><strong>{key === 'node' ? 'Node.js' : 'Git'}: {dependencies[key]}</strong><br />
          {dependencies[key] === 'AVAILABLE' ? 'Available on the IDE process PATH.' : 'Install or repair ' + (key === 'node' ? 'Node.js' : 'Git') + ' on PATH, then restart the IDE.'}</p>)}
      <p>C# requires .NET SDK 10+ and csharp-ls 0.27.0 under the existing provider policy. See the C# status bar for the active project.</p>
    </div>
  </Dialog>
}
