import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

interface Props {
  collapsed: boolean
  disabled?: boolean
  onToggle(): void
}

export function LearningSidebarHeader({ collapsed, disabled = false, onToggle }: Props) {
  const label = collapsed ? 'Mở rộng lộ trình' : 'Thu gọn lộ trình'
  return <div className="learning-sidebar-header" data-collapsed={collapsed}>
    {!collapsed && <span>Lộ trình học</span>}
    <button type="button" className="learning-sidebar-toggle" onClick={onToggle} disabled={disabled}
      aria-label={label} title={label} aria-expanded={!collapsed} aria-controls="learning-chapters">
      {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
    </button>
  </div>
}
