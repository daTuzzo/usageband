// The open menu, drawn through the engine on each surface, which checks every tree
// against that surface's elements: the details header's controls and the subagents'
// names. Run: claude plugin test
import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usageband',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const USAGE = {
  rateLimits: [
    { kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-24T15:00:00Z' },
    { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-29T09:00:00Z' },
  ],
  context: { tokens: 688_000, window: 1_000_000 },
  cost: { usd: 12.5 },
}

/** A subagent's record on disk, as the engine writes it beside the session's transcript. */
const RECORD = '{"agentType":"Explore","description":"Count the md files in the repo","name":"counter"}'

const USED = { model: 'claude-opus-5-5', input_tokens: 100, output_tokens: 20_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

type Ui = Awaited<ReturnType<Parameters<Parameters<typeof test>[1]>[0]['ui']['mount']>>
const props = async (ui: Ui, key: string) => (await ui.find({ key }))?.props
const svgs = async (ui: Ui) => (await ui.findAll({ type: 'Svg' })).map(s => s.props as { source: string; alt: string; isInteractive?: boolean })

test('the details header: keep warm button and length, timer pill, mascot drawn', async ($, on) => {
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
  on('fs.read', () => ({ value: '{ "version": "0.20.0" }' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.drawn() // rejects when the surface refuses the tree

    // The picker sets the length only: 8h until another is picked, and nothing starts.
    const values = (p: Record<string, unknown> | undefined) => (p?.options as { value: string }[]).map(o => o.value)
    expect(values(await props(ui, 'usageband-warm-hours'))).toEqual(['4', '8', '12', '24', 'custom'])
    expect((await props(ui, 'usageband-warm-hours'))?.value).toBe('8')
    await ui.select({ key: 'usageband-warm-hours', value: '24' })
    expect((await props(ui, 'usageband-warm-hours'))?.value).toBe('24')
    expect((await props(ui, 'usageband-keepwarm'))?.variant).toBeUndefined()
    expect((await svgs(ui)).some(s => s.alt.startsWith('Keep warm'))).toBe(false)

    // The button starts it: primary while it runs, and the timer pill shows the time left.
    await ui.press({ key: 'usageband-keepwarm' })
    expect((await props(ui, 'usageband-keepwarm'))?.label).toBe('Keep warm')
    expect((await props(ui, 'usageband-keepwarm'))?.variant).toBe('primary')
    const pill = (await svgs(ui)).find(s => s.alt.startsWith('Keep warm'))
    expect(pill?.alt).toBe('Keep warm: 1d0h left, 0 pings sent.')
    expect(pill?.source).toContain('stroke-dasharray')

    // Custom: a length out of range shows the range; a good one is picked and the field closes.
    await ui.select({ key: 'usageband-warm-hours', value: 'custom' })
    expect(await ui.find({ key: 'usageband-hours' })).toBeDefined()
    await ui.input({ key: 'usageband-hours', text: '200' })
    expect((await ui.find({ type: 'Text', text: /to 72 hours/ }))?.text).toBe('1 to 72 hours')
    await ui.input({ key: 'usageband-hours', text: '6h' })
    expect(await ui.find({ key: 'usageband-hours' })).toBeUndefined()
    expect((await props(ui, 'usageband-warm-hours'))?.value).toBe('6')
    expect(values(await props(ui, 'usageband-warm-hours'))).toEqual(['4', '6', '8', '12', '24', 'custom'])
    expect((await svgs(ui)).find(s => s.alt.startsWith('Keep warm'))?.alt).toBe('Keep warm: 6h00 left, 0 pings sent.')

    // A second press stops it.
    await ui.press({ key: 'usageband-keepwarm' })
    expect((await props(ui, 'usageband-keepwarm'))?.variant).toBeUndefined()
    expect((await svgs(ui)).some(s => s.alt.startsWith('Keep warm'))).toBe(false)
    await ui.select({ key: 'usageband-warm-hours', value: '8' })

    // The mascot button: the drawn portrait, a transparent Button over it.
    expect((await svgs(ui)).find(s => s.alt.startsWith('Mascot'))?.alt).toBe('Mascot off')
    expect((await props(ui, 'usageband-mascot'))?.plain).toBe(true)
    expect(String((await props(ui, 'usageband-mascot'))?.label).trim()).toBe('')
    await ui.press({ key: 'usageband-mascot' })
    expect((await svgs(ui)).find(s => s.alt.startsWith('Mascot'))?.alt).toBe('Mascot on')
    await ui.press({ key: 'usageband-mascot' })
    await ui.unmount()
  }

  // The phone app has no Select: the button runs the length last picked.
  const phone = await $.ui.mount({ ...BAND, surface: 'mobile' })
  await phone.drawn()
  expect(await phone.find({ key: 'usageband-warm-hours' })).toBeUndefined()
  await phone.press({ key: 'usageband-keepwarm' })
  expect((await svgs(phone)).find(s => s.alt.startsWith('Keep warm'))?.alt).toBe('Keep warm: 8h00 left, 0 pings sent.')
  await phone.press({ key: 'usageband-keepwarm' })
  await phone.unmount()
})

test('subagents are named from spawn, record or prompt; the rest show by model, and collapse into one', async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-10-24T12:00:00Z') }))
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
  // Only "a-old" has a record; "a-fork" (an engine run) has none.
  on('fs.read', (_, e) => {
    if (e.path.endsWith('agent-a-old.meta.json')) return { value: RECORD }
    if (e.path.endsWith('plugin.json')) return { value: '{ "version": "0.20.0" }' }
    throw new Error('no such file')
  })
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a-new' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.SessionStart', () => ({}))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.classic.SessionStart({ source: 'startup', transcript_path: 'C:\\Users\\me\\.claude\\projects\\p\\s1.jsonl' })
  await $.agent.spawn({
    tool_use_id: 'toolu_1', prompt: 'Build it', description: 'Build usage band variant E', subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false,
  })
  // A workflow's agent: no description anywhere, so the first line of its prompt names it.
  await $.turn.start({ text: '\nReview the diff for correctness bugs\nReport each one.', turnId: 't-wf', agentId: 'a-wf' })
  for (const agentId of ['a-new', 'a-old', 'a-wf', 'a-fork1', 'a-fork2']) {
    await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: `t-${agentId}`, reason: 'answer', agentId, usage: USED })
  }

  // Wide enough for all five chips on one page (six to a row).
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 200 }, surface: 'desktop' })
  await ui.drawn()
  const card = async () => (await svgs(ui)).find(s => s.isInteractive)?.source ?? ''
  expect(await card()).toContain('<title>Build usage band variant E\n$0.40')
  expect(await card()).toContain('<title>Count the md files in the repo')
  expect(await card()).toContain('<title>Review the diff for correctness bugs')
  expect(await card()).not.toMatch(/>subagent</i)
  expect((await ui.find({ type: 'Text', text: /5 ran/ }))?.text).toMatch(/5 ran/)
  // The two engine runs: one chip each, by model, until collapsed into one.
  expect((await card()).match(/>Opus run</g)?.length).toBe(2)
  expect((await props(ui, 'usageband-unnamed'))?.label).toBe('Collapse unnamed')
  await ui.press({ key: 'usageband-unnamed' })
  expect(await card()).toContain('>unnamed (2)<')
  expect(await card()).not.toContain('>Opus run<')
  expect((await props(ui, 'usageband-unnamed'))?.label).toBe('Expand unnamed')
  await ui.press({ key: 'usageband-unnamed' })
  expect((await card()).match(/>Opus run</g)?.length).toBe(2)
  await ui.unmount()
})

test("the open menu fits the band's slot: whole, else two tabs, else three", async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-10-24T12:00:00Z') }))
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
  on('fs.read', () => ({ value: '{ "version": "0.22.0" }' }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a-1' }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({
    tool_use_id: 'toolu_3', prompt: 'Look', description: 'Fresh visual review', subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false,
  })
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 't-1', reason: 'answer', agentId: 'a-1', usage: USED })

  const mountAt = (bodyColumns: number) => $.ui.mount({ ...BAND, requestId: `band-${bodyColumns}`, props: { ...BAND.props, bodyColumns }, surface: 'desktop' })
  const parts = async (ui: Ui) => {
    const all = await svgs(ui)
    return { figures: all.find(s => s.alt.startsWith('Tokens') || s.alt.startsWith('Next') || s.alt.startsWith('5H resets') || s.alt.includes('in cache')), agents: all.find(s => s.isInteractive) }
  }
  const tabKeys = async (ui: Ui) => (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '').filter(k => k.startsWith('usageband-tab-'))

  // Wide: the whole menu, its label, no tabs.
  const wide = await mountAt(100)
  expect(await tabKeys(wide)).toEqual([])
  expect(await wide.find({ type: 'Text', text: 'DETAILS' })).toBeDefined()
  expect((await parts(wide)).figures).toBeDefined()
  expect((await parts(wide)).agents).toBeDefined()
  await wide.unmount()

  // Narrower: two tabs, the figures first; the subagents tab swaps them.
  const mid = await mountAt(72)
  expect(await tabKeys(mid)).toEqual(['usageband-tab-figures', 'usageband-tab-agents'])
  expect((await props(mid, 'usageband-tab-figures'))?.plain).toBeUndefined()
  expect((await props(mid, 'usageband-tab-agents'))?.plain).toBe(true)
  expect((await parts(mid)).agents).toBeUndefined()
  await mid.press({ key: 'usageband-tab-agents' })
  expect((await parts(mid)).agents).toBeDefined()
  expect((await parts(mid)).figures).toBeUndefined()
  await mid.press({ key: 'usageband-tab-figures' })
  await mid.unmount()

  // Narrowest: the figures split in two; picking a half shows its own figures.
  const narrow = await mountAt(55)
  expect(await tabKeys(narrow)).toEqual(['usageband-tab-tokens', 'usageband-tab-cache', 'usageband-tab-agents'])
  const shown = async () => (await svgs(narrow)).filter(s => !s.isInteractive).map(s => s.source).join('')
  expect(await shown()).toContain('>SENT<')
  expect(await shown()).not.toContain('>LAST REPLY<')
  await narrow.press({ key: 'usageband-tab-cache' })
  expect(await shown()).toContain('>LAST REPLY<')
  expect(await shown()).not.toContain('>SENT<')
  await narrow.unmount()
})

test("a subagent's cache writes are priced at the 5-minute rate", async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-10-24T12:00:00Z') }))
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
  on('fs.read', () => ({ value: '{ "version": "0.21.0" }' }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a-w' }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({
    tool_use_id: 'toolu_2', prompt: 'Write it', description: 'Write a long file', subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false,
  })
  const writes = { model: 'claude-opus-5-5', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 1_000_000 }
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 't-w', reason: 'answer', agentId: 'a-w', usage: writes })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // 1M tokens written on Opus: $5.00 at the 5-minute rate (it was $8.00 at the 1-hour rate).
  expect((await svgs(ui)).find(s => s.isInteractive)?.source).toContain('<title>Write a long file\n$5.00')
  await ui.unmount()
})
