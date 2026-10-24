// The open menu's header, drawn through the engine on each surface, which checks every
// tree against that surface's elements. Run: claude plugin test
import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usageband',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const USAGE = {
  rateLimits: [
    { kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-24T15:00:00Z' },
    { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-29T09:00:00Z' },
  ],
  context: { tokens: 688_000, window: 1_000_000 },
  cost: { usd: 12.5 },
}

type Ui = Awaited<ReturnType<Parameters<Parameters<typeof test>[1]>[0]['ui']['mount']>>
const props = async (ui: Ui, key: string) => (await ui.find({ key }))?.props

test('keep warm is a picker with presets and custom; the mascot is an icon button', async ($, on) => {
  // Nothing sits beneath the plugin: each hook here stands for the engine.
  const now = Date.parse('2026-10-24T12:00:00Z')
  on('clock.now', () => ({ value: now }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'band' } }))
  on('store.get', (_, e) => ({ value: e.key === 'view' ? 'open' : undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('agent.list', () => ({ value: [] }))
  on('http.fetch', () => ({ value: { ok: false, status: 503, text: '' } }))
  on('fs.read', () => ({ value: '{ "version": "0.19.0" }' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.drawn() // rejects when the surface refuses the tree

    const values = (p: Record<string, unknown> | undefined) => (p?.options as { value: string }[]).map(o => o.value)
    expect(values(await props(ui, 'usageband-keepwarm'))).toEqual(['off', '4', '8', '12', '24', 'custom'])
    expect((await props(ui, 'usageband-keepwarm'))?.value).toBe('off')

    await ui.select({ key: 'usageband-keepwarm', value: '24' })
    expect((await props(ui, 'usageband-keepwarm'))?.value).toBe('24')
    expect((await ui.find({ type: 'Text', text: /left$/ }))?.text).toMatch(/^(1d|24h|23h)/)

    // Custom opens the hours field; a length out of range shows the range; a good one runs.
    await ui.select({ key: 'usageband-keepwarm', value: 'custom' })
    expect(await ui.find({ key: 'usageband-hours' })).toBeDefined()
    await ui.input({ key: 'usageband-hours', text: '200' })
    expect((await ui.find({ type: 'Text', text: /to 72 hours/ }))?.text).toBe('1 to 72 hours')
    await ui.input({ key: 'usageband-hours', text: '6h' })
    expect(await ui.find({ key: 'usageband-hours' })).toBeUndefined()
    expect((await props(ui, 'usageband-keepwarm'))?.value).toBe('6')
    expect(values(await props(ui, 'usageband-keepwarm'))).toEqual(['off', '4', '6', '8', '12', '24', 'custom'])

    await ui.select({ key: 'usageband-keepwarm', value: 'off' })
    expect((await props(ui, 'usageband-keepwarm'))?.value).toBe('off')
    expect(await ui.find({ type: 'Text', text: /left$/ })).toBeUndefined()

    // The mascot button: the glyph alone, dim while off, primary while on.
    const off = await props(ui, 'usageband-mascot')
    expect([off?.label, off?.dimColor, off?.variant]).toEqual(['\u{1F9D4}', true, undefined])
    await ui.press({ key: 'usageband-mascot' })
    expect((await props(ui, 'usageband-mascot'))?.variant).toBe('primary')
    await ui.press({ key: 'usageband-mascot' })
    await ui.unmount()
  }

  // The phone app has no Select: keep warm falls back to a button that steps.
  const phone = await $.ui.mount({ ...BAND, surface: 'mobile' })
  await phone.drawn()
  expect((await props(phone, 'usageband-keepwarm'))?.label).toBe('keep warm off')
  await phone.press({ key: 'usageband-keepwarm' })
  expect((await props(phone, 'usageband-keepwarm'))?.label).toBe('keep warm 4h')
  await phone.unmount()
})
