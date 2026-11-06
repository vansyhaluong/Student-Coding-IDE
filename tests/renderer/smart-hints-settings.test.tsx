/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SmartHintsSettings, smartHintsStateLabel } from '../../src/renderer/src/features/settings/SmartHintsSettings'
import type { SmartHintsSettingsSnapshot } from '../../src/shared/contracts/smart-hints-settings'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const off: SmartHintsSettingsSnapshot = { enabled: false, provider: 'GEMINI', model: 'gemini-3.1-flash-lite', hasKey: false,
  state: 'DISABLED', usedRequests: 0, requestLimit: 3,
  remainingRequests: 3, lifetimeRequests: 0, resetAt: Date.UTC(2026, 10, 4), retryAt: null, needsLimitReview: false }
const ok = (value: SmartHintsSettingsSnapshot) => ({ ok: true as const, value })
function setup() {
  const api = { get: vi.fn(async () => ok(off)), enable: vi.fn(async () => ok({ ...off, enabled: true, state: 'MISSING_KEY' as const })),
    configureKey: vi.fn(async () => ok({ ...off, enabled: true, hasKey: true, state: 'READY' as const })),
    removeKey: vi.fn(async () => ok(off)), check: vi.fn(async () => ok({ ...off, enabled: true, hasKey: true, state: 'READY' as const })),
    budget: vi.fn(async () => ok(off)) }
  vi.stubGlobal('studentIde', { settings: { smartHints: api } })
  const ui = render(<SmartHintsSettings />)
  return { api, ui }
}
describe('normal Settings Smart Hints controls never accept/render an API key', () => {
  it('loads disabled, configures via no-argument native command and checks explicitly without source', async () => {
    const f = setup(); await screen.findByText('Đã tắt')
    expect(f.api.configureKey).not.toHaveBeenCalled(); expect(f.api.check).not.toHaveBeenCalled()
    expect(f.ui.container.querySelector('input[type="password"]')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bật AI Smart Hints' })); await screen.findByText('Thiếu API Key')
    expect(f.api.enable).toHaveBeenCalledWith({ enabled: true })
    fireEvent.click(screen.getByRole('button', { name: 'Cấu hình API Key…' })); await screen.findByText('Sẵn sàng')
    expect(f.api.configureKey.mock.calls[0]).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra kết nối (không gửi code)' }))
    await waitFor(() => expect(f.api.check).toHaveBeenCalledOnce()); expect(f.api.check.mock.calls[0]).toEqual([])
  })
  it('does not enable or replenish budget while loading; quota and connection status are explicit', async () => {
    const f = setup(); await screen.findByText('Đã tắt')
    expect(f.api.enable).not.toHaveBeenCalled(); expect(f.api.budget).not.toHaveBeenCalled()
    f.api.enable.mockResolvedValueOnce(ok({ ...off, enabled: true, hasKey: true, state: 'LOCAL_BUDGET_EXHAUSTED', usedRequests: 3, remainingRequests: 0, lifetimeRequests: 3 }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bật AI Smart Hints' }))
    await screen.findByText('Đã dùng hết hạn mức trong ngày của IDE')
    expect(screen.getByText(/còn 0 lượt/)).toBeTruthy()
  })
  it('distinguishes all four limits and applies an absolute daily cap only on explicit click', async () => {
    expect(new Set(['LOCAL_BUDGET_EXHAUSTED', 'LOCAL_RATE_LIMIT', 'GEMINI_RATE_LIMIT', 'GEMINI_QUOTA_EXHAUSTED']
      .map(s => smartHintsStateLabel[s as keyof typeof smartHintsStateLabel])).size).toBe(4)
    const f = setup(); await screen.findByText('Đã tắt')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Ngân sách Smart Hints' }), { target: { value: '20' } })
    expect(f.api.budget).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu hạn mức theo ngày…' }))
    await waitFor(() => expect(f.api.budget).toHaveBeenCalledWith({ dailyLimit: 20 }))
    expect(f.api.check).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật hạn mức (offline)' }))
    await waitFor(() => expect(f.api.get).toHaveBeenCalledTimes(2))
    expect(f.api.check).not.toHaveBeenCalled()
    expect(screen.getByText(/Kỳ tiếp theo:/)).toBeTruthy()
  })
})
