import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  CacheClock, KeepWarm, UsagebandAgentInfo, UsagebandAgents, UsagebandCounters, UsagebandLimit, UsagebandMenuTab, UsagebandRelease, UsagebandView,
} from '../types'
import {
  CONTROLS_COL_CELLS, CONTROLS_ROW_CELLS, MASCOT_ICON, OPEN_PX, PAL,
  agentsSvg, bandSvg, fmtTok, mascotIconSvg, menuPages, menuSvg, openFits, shortSpan, slotPx, svgPx, timerPillSvg, tone,
} from './art'
import type { AgentCost, BandView, Gauge } from './art'
import {
  DEFAULT_HOURS, KEEP_WARM_HOURS, MAX_HOURS, MIN_HOURS, PING_TEXT,
  keepWarmStep, parseHours, pingFoundCold, retimeKeepWarm, toggleKeepWarm,
} from './keepwarm'
import { CACHE_TTL_MS, FAMILIES, PRICES, familyFor, formatUsd, nextMessageCost, requestCost } from './pricing'
import { CHECK_EVERY_MS, LATEST_URL, MANUAL_UPDATE, UPDATE_STEPS, isNewer, versionOf } from './update'
import type { CacheState, Family } from './pricing'

// usageband: how much of the 5-hour and 7-day limits is left, whether the prompt
// cache is warm or cold, what the next message would cost, and what the session has
// spent. A band above the prompt, a menu it opens upward, and a line in the footer.
// It only reads figures the engine already has, so it costs no tokens.

/** Redraw interval: keeps the cache countdown and the warm/cold switch on time, and catches a missed resize. */
const REDRAW_MS = 10_000
/** A limit under this share left is flagged LOW. */
const HIGH_FROM = 85
const NO_COUNTS: UsagebandCounters = { prompts: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
/** The menu's card: a shade darker than the band, its border #ffffff14 laid over that shade. */
const CARD_FILL = '#181713'
const CARD_BORDER = '#2a2925'
/** The subagents card inside the menu: a lighter shade and its own border, so the part that pages stands apart. */
const AGENTS_FILL = '#211f1a'
const AGENTS_BORDER = '#3a372e'
/** Six pixels of air between the menu's card and the band. */
const AIR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="${OPEN_PX.air}" viewBox="0 0 1 ${OPEN_PX.air}"></svg>`
/**
 * The header's controls, in CSS pixels, to tell whether they fit one line: the label or the
 * two tabs, Keep warm, the length picker, the mascot, and the gaps and padding around them.
 */
const HEAD_W = { label: 60, tabs2: 190, tabs3: 250, pill: 120, keepWarm: 80, picker: 56, mascot: 22, gaps: 60 } as const
/** The tabs' labels: "Usage" holds the tokens, the prompts and the reset times. */
const TAB_LABELS: Record<UsagebandMenuTab, string> = { figures: 'Figures', tokens: 'Usage', cache: 'Cache', agents: 'Subagents' }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** The $.store key under which the chosen view outlives the session. */
const STORED_VIEW = 'view'

const limits = atom({ plugin: 'usageband', key: 'limits' } as const, [] as UsagebandLimit[])
const cacheClock = atom({ plugin: 'usageband', key: 'cacheClock' } as const, null as CacheClock | null)
const counters = atom({ plugin: 'usageband', key: 'counters' } as const, NO_COUNTS)
const agentSpend = atom({ plugin: 'usageband', key: 'agentSpend' } as const, {} as UsagebandAgents)
const agentInfo = atom({ plugin: 'usageband', key: 'agentInfo' } as const, {} as UsagebandAgentInfo)
const groupUnnamed = atom({ plugin: 'usageband', key: 'groupUnnamed' } as const, false)
const menuTab = atom({ plugin: 'usageband', key: 'menuTab' } as const, 'figures' as UsagebandMenuTab)

/** Adds what was just learned of one subagent to what is known of it. */
const learnAgent = ($: EngineInterface, agentId: string, info: UsagebandAgentInfo[string]): Promise<unknown> =>
  update($, agentInfo, all => ({ ...all, [agentId]: { ...all[agentId], ...info } }))

/** The first line of a prompt, as a name: at most 80 characters. '' for a prompt with no words. */
const firstLine = (text: string): string => {
  const line = text.split('\n').map(s => s.trim()).find(s => s !== '') ?? ''
  return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line
}
const view = atom({ plugin: 'usageband', key: 'view' } as const, 'band' as UsagebandView)
const page = atom({ plugin: 'usageband', key: 'page' } as const, 0)
const mascot = atom({ plugin: 'usageband', key: 'mascot' } as const, false)
/** The $.store key for the mascot setting; off unless chosen. */
const STORED_MASCOT = 'showMascot'
const keepWarm = atom({ plugin: 'usageband', key: 'keepWarm' } as const, null as KeepWarm | null)
const warmHours = atom({ plugin: 'usageband', key: 'warmHours' } as const, DEFAULT_HOURS)
/** The $.store key for the keep-warm length picked, so the next session starts with it. */
const STORED_WARM_HOURS = 'keepWarmHours'
const askHours = atom({ plugin: 'usageband', key: 'askHours' } as const, null as string | null)
const subagentDir = atom({ plugin: 'usageband', key: 'subagentDir' } as const, null as string | null)
/** The keep-warm picker's option that opens the hours field. */
const CUSTOM = 'custom'
/**
 * The mascot button's label: figure spaces, which a button keeps (plain spaces collapse),
 * so the transparent Button laid over the mascot drawing covers it.
 */
const MASCOT_HIT = ' '.repeat(4)
const release = atom({ plugin: 'usageband', key: 'release' } as const, null as UsagebandRelease | null)

/** The newer version waiting on GitHub, or null when this install is current or the check has not answered. */
const pendingUpdate = (r: UsagebandRelease | null): string | null =>
  r !== null && r.latest !== null && r.installed !== '' && isNewer(r.latest, r.installed) ? r.latest : null

/** Reads the installed version and the newest one on GitHub. A failed check changes nothing. */
const checkForUpdate = async ($: EngineInterface): Promise<void> => {
  let installed: string | null = null
  try {
    installed = versionOf(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
  } catch {
    installed = null
  }
  let latest: string | null = null
  try {
    const res = await $.http.fetch(LATEST_URL)
    latest = res.ok ? versionOf(res.text) : null
  } catch {
    latest = null // offline, or network use turned off: try again later
  }
  await update($, release, r => ({ installed: installed ?? r?.installed ?? '', latest: latest ?? r?.latest ?? null, note: r?.note ?? null }))
}

/** Runs Claude Code's own update commands. The new version loads in the next session. */
const runUpdate = async ($: EngineInterface): Promise<void> => {
  const target = pendingUpdate(await read($, release))
  if (target === null) return
  const setNote = (note: string) => update($, release, r => (r === null ? r : { ...r, note }))
  await setNote(`updating to ${target}`)
  for (const argv of UPDATE_STEPS) {
    let ok = false
    try {
      ok = (await $.process.run(argv, { timeoutMs: 180_000 })).exitCode === 0
    } catch {
      ok = false // the claude command could not start from here (an npm .cmd install, say)
    }
    if (!ok) {
      await setNote(`update failed: run ${MANUAL_UPDATE}`)
      return
    }
  }
  await update($, release, r => (r === null ? r : { ...r, installed: target, note: `updated to ${target}: new sessions load it` }))
}

/** Whether a main-thread turn is running; set by turn.step, cleared by turn.complete. */
let mainTurnOpen = false

/** The Keep warm button: starts a timer for the length picked, or stops the one running. */
const flipKeepWarm = async ($: EngineInterface): Promise<void> => {
  const now = await $.clock.now()
  const hours = await read($, warmHours)
  await update($, keepWarm, kw => toggleKeepWarm(kw, hours, now))
}

/**
 * A pick from the length picker: a length in hours, or custom, which opens the hours field.
 * It only sets the length (remembered for later sessions); a running timer takes it from now.
 */
const pickKeepWarm = async ($: EngineInterface, value: string): Promise<void> => {
  if (value === CUSTOM) {
    await update($, askHours, () => '')
    return
  }
  const hours = Number(value)
  if (!(hours > 0)) return
  await update($, askHours, () => null)
  await update($, warmHours, () => hours)
  await $.store.set(STORED_WARM_HOURS, hours)
  const now = await $.clock.now()
  await update($, keepWarm, kw => retimeKeepWarm(kw, hours, now))
}

/** Enter in the hours field: a length in range is picked and the field closes; else the range shows beside it. */
const typeHours = async ($: EngineInterface, text: string): Promise<void> => {
  const hours = parseHours(text)
  if (hours === null) {
    await update($, askHours, () => `${MIN_HOURS} to ${MAX_HOURS} hours`)
    return
  }
  await pickKeepWarm($, String(hours))
}

/** The picker's lengths: the presets, plus a typed length once picked, in order, then custom. */
const keepWarmOptions = (picked: number): { value: string; label: string }[] => [
  ...[...new Set([...KEEP_WARM_HOURS, picked])].sort((a, b) => a - b).map(h => ({ value: String(h), label: `${h}h` })),
  { value: CUSTOM, label: 'custom' },
]

// ---------- Subagent names ----------
/**
 * The folder of a session's subagent records, from its transcript's path:
 * `<id>.jsonl` beside `<id>/subagents/agent-<agentId>.meta.json`.
 */
const subagentsDirOf = (transcriptPath: string): string | null => {
  if (!transcriptPath.endsWith('.jsonl')) return null
  const sep = transcriptPath.includes('\\') ? '\\' : '/'
  return `${transcriptPath.slice(0, -'.jsonl'.length)}${sep}subagents`
}

/** Each record looked up so far: its task description, or null when it has none. Read once per agent. */
const recordNames = new Map<string, string | null>()

/**
 * A subagent's task description from its record on disk, for one the spawn hook did not
 * name (spawned before this version loaded). Engine runs (compaction, memory) and
 * workflow agents have no such record, or one with no description: null.
 */
const nameFromRecord = async ($: EngineInterface, dir: string, agentId: string): Promise<string | null> => {
  const known = recordNames.get(agentId)
  if (known !== undefined) return known
  let name: string | null = null
  try {
    const sep = dir.includes('\\') ? '\\' : '/'
    const meta: unknown = JSON.parse(await $.fs.read(`${dir}${sep}agent-${agentId}.meta.json`))
    const field = (k: string): string | null => {
      const x = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>)[k] : undefined
      return typeof x === 'string' && x !== '' ? x : null
    }
    name = field('description') ?? field('name')
  } catch {
    name = null // no record, or none readable
  }
  recordNames.set(agentId, name)
  return name
}

const stopKeepWarm = async ($: EngineInterface, note: string): Promise<void> => {
  await update($, keepWarm, kw => (kw === null ? null : { ...kw, until: 0, pendingAt: 0, note }))
}

/** Runs on every redraw tick: sends a ping when the cache is one minute from cold and every guard passes. */
const keepWarmTick = async ($: EngineInterface): Promise<void> => {
  const kw = await read($, keepWarm)
  if (kw === null || kw.until <= 0) return
  const now = await $.clock.now()
  const cache = readCache(await read($, cacheClock), now)
  const step = keepWarmStep(kw, cache, await read($, limits), now, mainTurnOpen)
  if (step.act === 'stop') return stopKeepWarm($, step.note)
  if (step.act !== 'ping') return
  await update($, keepWarm, k => (k === null ? null : { ...k, pendingAt: now }))
  // Sent bare (asUser): no engine frame around it. Its origin stays the plugin, so it is never counted as a prompt.
  await $.prompt.submit({ text: PING_TEXT, asUser: true })
}

const isView = (x: unknown): x is UsagebandView => x === 'mini' || x === 'band' || x === 'open'

/** Turns the mascot on or off, and keeps the choice for later sessions. */
const flipMascot = async ($: EngineInterface): Promise<void> => {
  await update($, mascot, on => !on)
  await $.store.set(STORED_MASCOT, await read($, mascot))
}

/** Switches what the mod shows, and remembers the choice for later sessions and other windows. */
const setView = async ($: EngineInterface, next: (v: UsagebandView) => UsagebandView): Promise<void> => {
  await update($, view, next)
  await $.store.set(STORED_VIEW, await read($, view))
}

// ---------- The prompt cache's clock ----------

/** The engine's rate-limit windows, kept as plain data. */
const asLimits = (windows: readonly { kind: string; percentUsed: number; resetsAt?: string }[]): UsagebandLimit[] =>
  windows.map(({ kind, percentUsed, resetsAt }) => ({ kind, usedPct: percentUsed, resetsAt }))

/** The cache right now, from its clock: warm or cold, how long since the last send, and its size. */
type CacheReading = { state: CacheState; idleMs: number; idleMin: number; tokens: number; window: number; family: Family | null }

const readCache = (clock: CacheClock | null, nowMs: number): CacheReading | null => {
  // Until a request has gone out and the context has a size, there is nothing to show.
  if (clock === null || clock.sentAt <= 0 || clock.contextTokens <= 0) return null
  const idleMs = nowMs > clock.sentAt ? nowMs - clock.sentAt : 0
  return {
    state: idleMs < CACHE_TTL_MS ? 'warm' : 'cold',
    idleMs,
    idleMin: Math.floor(idleMs / 60_000),
    tokens: clock.contextTokens,
    window: clock.contextWindow,
    family: familyFor(clock.model),
  }
}

/** Fetches the rate-limit windows from the engine. */
const syncLimits = async ($: EngineInterface): Promise<void> => {
  const usage = await $.session.usage()
  await update($, limits, () => asLimits(usage.rateLimits))
}

/** Marks a main-thread request going out now: the cache's hour starts again. */
const stampSend = async ($: EngineInterface): Promise<void> => {
  const sentAt = await $.clock.now()
  await update($, cacheClock, clock => ({ contextTokens: 0, contextWindow: 0, model: null, ...clock, sentAt }))
}

/** After a main-thread turn: settle the send time and take the engine's current context size and model. */
const settleTurn = async ($: EngineInterface, turnMs: number, model: string | null): Promise<void> => {
  const endedAt = await $.clock.now()
  const before = await read($, cacheClock)
  // A send stamped during this turn stands; with none, the turn's end is the latest it can be.
  const sentAt = before !== null && endedAt - before.sentAt <= turnMs ? before.sentAt : endedAt
  const usage = await $.session.usage()
  const usedModel = model ?? (await $.session.model())
  const size = usage.context.tokens ?? 0
  await update($, cacheClock, clock => ({
    sentAt,
    contextTokens: size > 0 ? size : (clock?.contextTokens ?? 0),
    contextWindow: usage.context.window || (clock?.contextWindow ?? 0),
    model: usedModel || (clock?.model ?? null),
  }))
}

// ---------- What the band shows ----------

const clockText = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** One limit as the band draws it: share left, time to its reset, and the reset's clock time (with the day if past 24 h). */
const gaugeFor = (all: UsagebandLimit[], kind: string, nowMs: number): Gauge | null => {
  const lim = all.find(x => x.kind === kind)
  if (lim === undefined) return null
  const resetAt = lim.resetsAt ? Date.parse(lim.resetsAt) : Number.NaN
  const untilMs = resetAt - nowMs
  const when = new Date(resetAt)
  const known = !Number.isNaN(resetAt)
  return {
    used: Math.min(100, Math.max(0, Math.round(lim.usedPct))),
    reset: !known ? '' : untilMs <= 0 ? 'now' : shortSpan(untilMs),
    at: !known ? '' : untilMs < 86_400_000 ? clockText(when) : `${WEEKDAYS[when.getDay()] ?? ''} ${clockText(when)}`,
  }
}

/** Every figure the band, the menu and the footer draw, read from state and the engine. */
const bandView = async ($: EngineInterface): Promise<BandView> => {
  const nowMs = await $.clock.now()
  const lims = await read($, limits)
  const cache = readCache(await read($, cacheClock), nowMs)
  const totals = await read($, counters)
  const byAgent = await read($, agentSpend)
  let spent = 0
  try {
    spent = (await $.session.usage()).cost?.usd ?? 0
  } catch {
    spent = 0
  }
  // A name for each subagent, best first: its task description (recorded at spawn, else in
  // the engine's list, else in its record on disk), then the first line of its first prompt,
  // then its agent type. A run with none of these (the engine's own work) is named by its
  // model, one chip each, or all in one chip while "Collapse unnamed" is on.
  const info = await read($, agentInfo)
  const names = new Map<string, string>()
  for (const id of Object.keys(byAgent)) {
    const told = info[id]?.description
    if (told) names.set(id, told)
  }
  const nameless = (): string[] => Object.keys(byAgent).filter(id => !names.has(id))
  if (nameless().length > 0) {
    try {
      for (const a of await $.agent.list()) if (!names.has(a.id) && a.id in byAgent && a.description) names.set(a.id, a.description)
    } catch {
      // Names are only a label: the record on disk is tried next.
    }
  }
  const dir = await read($, subagentDir)
  if (dir !== null) {
    for (const id of nameless()) {
      const name = await nameFromRecord($, dir, id)
      if (name !== null) names.set(id, name)
    }
  }
  for (const id of nameless()) {
    const fallback = info[id]?.prompt || info[id]?.type
    if (fallback) names.set(id, fallback)
  }
  const agents: AgentCost[] = Object.entries(byAgent).flatMap(([id, usd]) => {
    const name = names.get(id)
    return name === undefined ? [] : [{ name, usd, full: name }]
  })
  const unnamed = nameless()
  const why = "no task name was recorded: the engine's own work (compaction, memory, summaries), or a subagent from before this version loaded"
  if ((await read($, groupUnnamed)) && unnamed.length > 1) {
    agents.push({
      name: `unnamed (${unnamed.length})`,
      usd: unnamed.reduce((sum, id) => sum + (byAgent[id] ?? 0), 0),
      full: `${unnamed.length} runs: ${why}`,
      dim: true,
    })
  } else {
    for (const id of unnamed) {
      const model = info[id]?.model
      const family = familyFor(model)
      agents.push({
        name: family === null ? 'unnamed run' : `${family.charAt(0).toUpperCase()}${family.slice(1)} run`,
        usd: byAgent[id] ?? 0,
        full: `Run ${id}${model ? ` on ${model}` : ''}: ${why}`,
        dim: true,
      })
    }
  }
  const warm = cache === null || cache.state === 'warm'
  const tokens = cache?.tokens ?? 0
  return {
    h5: gaugeFor(lims, 'five_hour', nowMs),
    d7: gaugeFor(lims, 'seven_day', nowMs),
    cache:
      cache === null
        ? null
        : {
            mode: cache.state,
            time: cache.state === 'warm' ? `${Math.max(0, 60 - cache.idleMin)}m` : shortSpan(cache.idleMs),
            idleMin: cache.idleMin,
          },
    tokens,
    window: cache?.window ?? 0,
    share: cache !== null && cache.window > 0 ? Math.min(1, cache.tokens / cache.window) : null,
    prices: FAMILIES.map(fam => ({
      id: fam,
      name: fam.toUpperCase(),
      usd: nextMessageCost(PRICES[fam], warm, tokens),
      isMine: cache?.family === fam,
    })),
    priceTop: Math.max(...FAMILIES.map(fam => nextMessageCost(PRICES[fam], false, tokens))),
    usd: spent,
    prompts: totals.prompts,
    input: totals.input,
    output: totals.output,
    cacheRead: totals.cacheRead,
    cacheWrite: totals.cacheWrite,
    agents,
    agentRuns: Object.keys(byAgent).length,
    unnamedRuns: unnamed.length,
    mascot: await read($, mascot),
  }
}

// ---------- The terminal's text form ----------
type Seg = { t: string; color: string; bold?: boolean }

const dotGauge = (used: number, color: string): Seg[] => {
  const lit = Math.max(0, Math.min(10, Math.round(used / 10)))
  return [
    { t: '●'.repeat(lit), color },
    { t: '·'.repeat(10 - lit), color: PAL.track },
  ]
}
const kv = (k: string, v: string, color: string = PAL.ink): Seg[] => [
  { t: `${k} `, color: PAL.muted },
  { t: v, color, bold: true },
]
const totalOf = (v: BandView): number => v.input + v.output + v.cacheRead + v.cacheWrite

/** NEXT: one more message now on the current model; "cold" when it re-writes the cache. */
const nextItem = (v: BandView): Seg[] => {
  const mine = v.prices.find(p => p.isMine)
  if (!mine) return kv('NEXT', '--')
  const cold = v.cache?.mode === 'cold'
  return [...kv(`NEXT ${mine.name}`, formatUsd(mine.usd)), ...(cold ? [{ t: ' cold', color: PAL.cold }] : [])]
}

const bandItems = (v: BandView): Seg[][] => {
  const gauge = (name: string, g: Gauge | null, color: string): Seg[] =>
    g
      ? [
          { t: `${name} `, color: PAL.muted },
          { t: `${g.used}% used `, color, bold: true },
          ...(g.used >= HIGH_FROM ? [{ t: 'HIGH ', color: PAL.d7, bold: true }] : []),
          ...dotGauge(g.used, color),
          ...(g.reset ? [{ t: ` ${g.reset}`, color: PAL.muted }] : []),
        ]
      : [{ t: `${name} --`, color: PAL.muted }]
  const c = v.cache
  return [
    gauge('5H', v.h5, PAL.h5),
    gauge('7D', v.d7, PAL.d7),
    c
      ? [
          { t: c.mode === 'warm' ? '● WARM ' : '❄ COLD ', color: tone(c.mode), bold: true },
          { t: c.time, color: tone(c.mode), bold: true },
          { t: c.mode === 'warm' ? ' left' : ' idle', color: PAL.muted },
        ]
      : [{ t: 'CACHE none yet', color: PAL.muted }],
    kv('SPENT', formatUsd(v.usd)),
    kv('TOKENS', fmtTok(totalOf(v))),
    nextItem(v),
  ]
}

const menuItems = (v: BandView): Seg[][] => {
  const hue = tone(v.cache?.mode ?? 'warm')
  const sub = v.agents.reduce((a, g) => a + g.usd, 0)
  return [
    kv('IN CACHE', `${fmtTok(v.tokens)}${v.share === null ? '' : ` (${Math.round(v.share * 100)}% of ${fmtTok(v.window)})`}`),
    ...v.prices.map(p => kv(p.isMine ? `NEXT ${p.name}` : p.name, formatUsd(p.usd), p.isMine ? hue : PAL.muted)),
    kv('SENT', fmtTok(v.input + v.cacheRead + v.cacheWrite)),
    kv('NEW', fmtTok(v.input)),
    kv('CACHE READ', fmtTok(v.cacheRead)),
    kv('CACHE WRITE', fmtTok(v.cacheWrite)),
    kv('OUT', fmtTok(v.output)),
    kv('PROMPTS', String(v.prompts)),
    kv('5H RESETS', [v.h5?.reset, v.h5?.at].filter(Boolean).join(' at ') || '--', PAL.h5),
    kv('7D RESETS', [v.d7?.reset, v.d7?.at].filter(Boolean).join(' on ') || '--', PAL.d7),
    kv(`SUBAGENTS (${v.agentRuns})`, formatUsd(sub)),
    kv('MAIN THREAD', formatUsd(Math.max(0, v.usd - sub))),
    ...[...v.agents].sort((a, b) => b.usd - a.usd).slice(0, 3).map(g => kv(g.name.slice(0, 32), formatUsd(g.usd), PAL.muted)),
  ]
}

const widthOf = (segs: Seg[]): number => segs.reduce((a, s) => a + [...s.t].length, 0)

/** Items into rows of at most `room` cells, three cells apart, in order. */
const pack = (items: Seg[][], room: number): Seg[][][] => {
  const rows: Seg[][][] = []
  let row: Seg[][] = []
  let used = 0
  for (const it of items) {
    const w = widthOf(it)
    if (row.length > 0 && used + 3 + w > room) {
      rows.push(row)
      row = []
      used = 0
    }
    used += (row.length > 0 ? 3 : 0) + w
    row.push(it)
  }
  if (row.length > 0) rows.push(row)
  return rows
}

export const register: Register = on => {
  on('session.start', async ($, ready, next) => {
    // Versions before 0.8.0 pinned a plain status line, and the engine keeps it until
    // a plugin clears it. The figures live in the footer row now, so clear it.
    $.ui.status(undefined)
    // Bring back the view picked in an earlier session or another window.
    const stored = await $.store.get(STORED_VIEW)
    if (isView(stored)) await update($, view, () => stored)
    if ((await $.store.get(STORED_MASCOT)) === true) await update($, mascot, () => true)
    const storedHours = await $.store.get(STORED_WARM_HOURS)
    if (typeof storedHours === 'number' && storedHours >= MIN_HOURS && storedHours <= MAX_HOURS) await update($, warmHours, () => storedHours)
    await syncLimits($)
    // /band shows a hidden band, or hides a shown one.
    await $.command.register({ name: 'band', description: 'Show or hide the usage band' })
    $.clock.every(REDRAW_MS, () => {
      $.ui.invalidate('ui.render')
      // The same tick checks the keep-warm timer; a slip there never stops the redraw.
      keepWarmTick($).catch(() => undefined)
    })
    // Look for a newer version now and every 6 hours, without holding the session up.
    checkForUpdate($).catch(() => undefined)
    $.clock.every(CHECK_EVERY_MS, () => {
      checkForUpdate($).catch(() => undefined)
    })
    return next(ready)
  })

  on('session.measure', async ($, measured, next) => {
    if (measured.changed.includes('rateLimits')) await update($, limits, () => asLimits(measured.rateLimits))
    const size = measured.context.tokens ?? 0
    if (measured.changed.includes('context') && size > 0) {
      const contextWindow = measured.context.window
      await update($, cacheClock, clock =>
        clock === null ? null : { ...clock, contextTokens: size, contextWindow: contextWindow || clock.contextWindow },
      )
    }
    return next(measured)
  })

  // /clear wipes the session's totals; /clear and /compact both empty the cache. A resumed
  // or forked session arrives with its idle time and context size, so the clock picks up there.
  on('classic.SessionStart', async ($, begin, next) => {
    const answer = await next(begin)
    // Where this session's subagent records are, to name a subagent the spawn hook missed.
    const dir = subagentsDirOf(begin.transcript_path)
    if (dir !== null) await update($, subagentDir, () => dir)
    if (begin.source === 'clear') {
      await update($, counters, () => NO_COUNTS)
      await update($, agentSpend, () => ({}))
      await update($, agentInfo, () => ({}))
      await update($, page, () => 0)
    }
    if (begin.source === 'clear' || begin.source === 'compact') {
      await update($, cacheClock, () => null)
    } else if ((begin.source === 'resume' || begin.source === 'fork') && typeof begin.seconds_since_last_response === 'number') {
      const awayMs = begin.seconds_since_last_response * 1000
      const sentAt = (await $.clock.now()) - awayMs
      const contextWindow = (await $.session.usage()).context.window
      const model = typeof begin.model === 'string' ? begin.model : await $.session.model()
      const contextTokens = typeof begin.context_tokens === 'number' ? begin.context_tokens : 0
      await update($, cacheClock, () => ({ sentAt, contextTokens, contextWindow, model }))
    }
    return answer
  }).catch(($, begin, next) => next(begin)) // if this fails, the session starts all the same

  // Counts a prompt the person sent: not a slash command, not one the engine made, not a
  // plugin's (keep-warm pings included), not one dropped.
  on('prompt.submit', async ($, sent, next) => {
    const answer = await next(sent)
    if (!sent.isMeta && !sent.command && sent.origin.kind !== 'plugin' && answer.drop === undefined) {
      await update($, counters, t => ({ ...t, prompts: t.prompts + 1 }))
    }
    return answer
  }).catch(($, sent, next) => next(sent)) // a counting slip never blocks a prompt

  // A main-thread request is going out: the cache is used now, so its hour restarts.
  on('turn.step', async function* ($, step, next) {
    if (step.agentId === undefined) {
      mainTurnOpen = true
      await stampSend($)
    }
    return yield* next(step)
  })

  // A subagent's first prompt: its first line names a subagent that has no task description
  // (a workflow's agent has none in its record).
  on('turn.start', async ($, start, next) => {
    const answer = await next(start)
    const agentId = start.agentId
    const line = firstLine(start.text)
    if (agentId !== undefined && line !== '' && (await read($, agentInfo))[agentId]?.prompt === undefined) {
      await learnAgent($, agentId, { prompt: line })
    }
    return answer
  }).catch(($, start, next) => next(start)) // naming never holds a turn back

  // Tokens add up over every turn, subagents' included, so they agree with the session's cost.
  // A subagent's turn is priced here too, at its model's rates, its cache writes at the
  // 5-minute rate it writes at: the engine has no per-agent cost.
  on('turn.complete', async ($, done, next) => {
    const answer = await next(done)
    const used = done.usage
    if (used) {
      await update($, counters, t => ({
        ...t,
        input: t.input + used.input_tokens,
        output: t.output + used.output_tokens,
        cacheRead: t.cacheRead + used.cache_read_input_tokens,
        cacheWrite: t.cacheWrite + used.cache_creation_input_tokens,
      }))
    }
    const agentId = done.agentId
    if (agentId !== undefined) {
      if (used) {
        const cost = requestCost(used.model, used, '5m')
        await update($, agentSpend, spend => ({ ...spend, [agentId]: (spend[agentId] ?? 0) + cost }))
        if (used.model) await learnAgent($, agentId, { model: used.model })
      }
      return answer
    }
    mainTurnOpen = false
    await settleTurn($, done.durationMs, used?.model ?? null)
    // A keep-warm ping's turn: count its real cost against the budget. If it wrote the
    // cache instead of reading it, the cache had already gone (or the session is on the
    // 5-minute cache of usage overage), so pinging is no use: stop.
    const kw = await read($, keepWarm)
    if (kw !== null && kw.pendingAt > 0) {
      const cost = used ? requestCost(used.model, used) : 0
      await update($, keepWarm, k => (k === null ? null : { ...k, pendingAt: 0, pings: k.pings + 1, spent: k.spent + cost }))
      if (used && pingFoundCold(used.cache_creation_input_tokens, used.cache_read_input_tokens)) {
        await stopKeepWarm($, 'cache had expired before the ping')
      }
    }
    return answer
  })

  // A subagent's name is known only while it starts: record its task description and its
  // type under the id it gets, so the menu can name it after it has finished.
  on('agent.spawn', async ($, spawn, next) => {
    const result = await next(spawn)
    const agentId = result.agentId
    if (agentId) {
      await learnAgent($, agentId, {
        ...(spawn.description ? { description: spawn.description } : {}),
        ...(spawn.subagentType ? { type: spawn.subagentType } : {}),
      })
    }
    return result
  }).catch(($, spawn, next) => next(spawn)) // naming never blocks a spawn

  // The folder of the session's subagent records, learned from any of these events, so a
  // session already running when this version loaded names its earlier subagents after its
  // next turn ends.
  on('classic.SubagentStart', async ($, start, next) => {
    const answer = await next(start)
    const dir = subagentsDirOf(start.transcript_path)
    if (dir !== null) await update($, subagentDir, () => dir)
    return answer
  }).catch(($, start, next) => next(start))
  on('classic.Stop', async ($, stop, next) => {
    const answer = await next(stop)
    const dir = subagentsDirOf(stop.transcript_path)
    if (dir !== null && dir !== (await read($, subagentDir))) await update($, subagentDir, () => dir)
    return answer
  }).catch(($, stop, next) => next(stop))

  on('command.run', { command: 'band' }, async $ => {
    await setView($, x => (x === 'mini' ? 'band' : 'mini'))
    return (await read($, view)) === 'mini'
      ? { text: 'Usage band hidden. Type /band to bring it back.' }
      : { text: 'Usage band shown.' }
  })

  // The footer row. The desktop app cuts this slot after about 25 characters, so it
  // holds only the expand/collapse Button and the cache in colour ("warm 42m" red,
  // "cold 1h12" blue). The rest of the line ("5h 77% │ 7d 96% │ $3.42") goes to the
  // plugin status line, which has room for it. Both refresh here, so a change to the
  // view or the figures, and the redraw interval, keep them current.
  let lastStatus: string | undefined
  on('ui.render', { component: 'SessionMode' }, async ($, ev) => {
    const { Box, Button, Text } = $.ui.resolve(ev)
    const hidden = (await read($, view)) === 'mini'
    const v = await bandView($)
    // Each window: share used (as Claude Code reports it), HIGH from 85%, and when it resets ("5h 23% used, resets 2h41").
    const gauge = (name: string, g: Gauge | null): string =>
      g ? `${name} ${g.used}% used${g.used >= HIGH_FROM ? ' HIGH' : ''}${g.reset ? `, resets ${g.reset}` : ''}` : `${name} --`
    const newer = pendingUpdate(await read($, release))
    const status = [gauge('5h', v.h5), gauge('7d', v.d7), formatUsd(v.usd), ...(newer ? [`update ${newer}`] : [])].join(' │ ')
    if (status !== lastStatus) {
      lastStatus = status
      $.ui.status(status)
    }
    const modes = ev.props.modes.join(' & ')
    const kw = await read($, keepWarm)
    const warming = kw !== null && kw.until > (await $.clock.now())
    return (
      <Box flexDirection="row" alignItems="center" flexShrink={0}>
        <Box key="toggle" flexShrink={0} marginRight={1}>
          <Button
            key="usageband-footer"
            label={hidden ? 'expand' : 'collapse'}
            onPress={() => void setView($, x => (x === 'mini' ? 'band' : 'mini'))}
          />
        </Box>
        {v.cache ? (
          <Text key="cache" color={tone(v.cache.mode)} weight="bold">
            {`${v.cache.mode} ${v.cache.time}`}
          </Text>
        ) : null}
        {warming ? (
          <Text key="kw" dimColor>
            {' kw'}
          </Text>
        ) : null}
        {modes ? (
          <Text key="modes" dimColor>
            {` ${modes}`}
          </Text>
        ) : null}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, ev, next) => {
    // Leave the slot to a survey, and to nothing at all while the band is hidden.
    if (ev.props.hasSurvey || (await read($, view)) === 'mini') return next(ev)

    const kit = $.ui.resolve(ev)
    const { Box, Button, Text } = kit
    // Laid out afresh from the width of this draw; no width is remembered anywhere.
    const cols = ev.props.bodyColumns ?? ev.viewport?.columns ?? 100
    const v = await bandView($)
    const isOpen = (await read($, view)) === 'open'
    const kw = await read($, keepWarm)
    const nowMs = await $.clock.now()
    const warmLeftMs = kw !== null && kw.until > nowMs ? kw.until - nowMs : 0
    const ask = await read($, askHours)
    const hours = await read($, warmHours)
    const timer =
      warmLeftMs > 0 && kw
        ? timerPillSvg({ leftMs: warmLeftMs, totalMs: kw.hours * 3_600_000, pings: kw.pings })
        : kw?.note
          ? timerPillSvg({ note: kw.note })
          : null
    const face = mascotIconSvg(await read($, mascot))
    const grouped = await read($, groupUnnamed)
    const rel = await read($, release)
    const newer = pendingUpdate(rel)

    // The menu opens upward, so the toggle points up while closed and down while open.
    // The toggle is the app's own primary Button; minimise is plain and quieter.
    const toggle = (
      <Button key="usageband-toggle" label={isOpen ? '▾' : '▴'} onPress={() => void setView($, x => (x === 'open' ? 'band' : 'open'))} />
    )
    const toMini = <Button key="usageband-mini" plain label="━" onPress={() => void setView($, () => 'mini')} />

    // Desktop, mobile and VS Code take the Svg drawings; the terminal has its own text
    // form. Decide by the surface, since the terminal's element table lists Svg as well.
    // An Svg gets no width or height: it takes its markup's width up to the slot, and its
    // Box may shrink below that, so the image scales down and the controls never clip.
    const Svg = ev.surface !== 'terminal' && 'Svg' in kit ? kit.Svg : null
    // The phone app draws no Select or Input (its kit lists them, and draws nothing): there
    // the Keep warm button runs the length last picked. Decide by the surface, as for Svg.
    const Select = ev.surface !== 'mobile' && 'Select' in kit ? kit.Select : null
    const Input = ev.surface !== 'mobile' && 'Input' in kit ? kit.Input : null
    if (Svg) {
      const image = (key: string, source: string, alt: string, grow = 1) => (
        <Box key={key} flexGrow={grow} flexShrink={1} minWidth={0} overflow="hidden">
          <Svg source={source} alt={alt} />
        </Box>
      )
      // One row of six chips: the two controls side by side, centred on it. Else the
      // band takes two rows or more and the controls stack, the toggle on row 1.
      const one = bandSvg(v, svgPx(cols, CONTROLS_ROW_CELLS))
      const wide = one.rows === 1
      const b = wide ? one : bandSvg(v, svgPx(cols, CONTROLS_COL_CELLS), 3)
      const menuW = svgPx(cols, 2)
      const m = isOpen ? menuSvg(v, menuW) : null
      // The subagents get their own card inside the menu, with their own pager: paging moves
      // only them, never the fixed figures above. The card sits 2 cells in from each side.
      const agentsW = svgPx(cols, 6)
      const a = isOpen && v.agents.length > 0 ? agentsSvg(v, agentsW, await read($, page)) : null
      const subTotal = v.agents.reduce((sum, g) => sum + g.usd, 0)
      // The pager counts pages afresh when pressed, never from what this draw saw.
      const turn = (step: number) => async () => {
        const pages = menuPages(await bandView($), agentsW)
        await update($, page, x => Math.max(0, Math.min(pages - 1, Math.min(pages - 1, x) + step)))
      }
      // The whole open view must fit the band's slot, or the app scrolls it and cuts its top
      // off. When it does not fit, tabs show one part at a time: the figures or the subagents;
      // in a pane too narrow for even that, the figures split in two (tokens, cache). The
      // header's width counts the timer pill whether it shows or not, so starting the timer
      // never switches the layout.
      const slot = slotPx(ev.props.maxRows)
      const fits = (labelW: number, stats: number, agents: number): boolean =>
        openFits({
          slot,
          band: b.h,
          headLines: menuW >= labelW + HEAD_W.pill + HEAD_W.keepWarm + HEAD_W.picker + HEAD_W.mascot + HEAD_W.gaps ? 1 : 2,
          stats,
          agents,
        })
      const tabs: UsagebandMenuTab[] =
        m === null || fits(HEAD_W.label, m.h, a?.h ?? 0)
          ? []
          : a !== null && fits(HEAD_W.tabs2, m.h, 0) && fits(HEAD_W.tabs2, 0, a.h)
            ? ['figures', 'agents']
            : ['tokens', 'cache', ...(a !== null ? (['agents'] as const) : [])]
      // The tab last picked, or its nearest part in this layout.
      const picked = await read($, menuTab)
      const tab: UsagebandMenuTab | null =
        tabs.length === 0
          ? null
          : tabs.includes(picked)
            ? picked
            : picked === 'figures'
              ? 'tokens'
              : picked === 'tokens' || picked === 'cache'
                ? 'figures'
                : (tabs[0] ?? null)
      const figures = m === null || tab === 'agents' ? null : tab === 'tokens' || tab === 'cache' ? menuSvg(v, menuW, tab) : m
      const tabButton = (which: UsagebandMenuTab) => (
        <Button
          key={`usageband-tab-${which}`}
          label={which === 'agents' ? `${TAB_LABELS.agents} ${formatUsd(subTotal)}` : TAB_LABELS[which]}
          {...(tab === which ? {} : { plain: true as const })}
          onPress={() => void update($, menuTab, () => which)}
        />
      )
      return (
        <Box flexDirection="column">
          {m ? (
            <Box key="menu" flexDirection="column" backgroundColor={CARD_FILL} borderStyle="round" borderColor={CARD_BORDER}>
              {/* A little taller than a text row, its controls apart; in a narrow pane they wrap, never clip.
                  When the menu cannot show whole, its label gives way to the two tabs (the one on show filled). */}
              <Box key="head" flexDirection="row" flexWrap="wrap" alignItems="center" paddingX={1} paddingY="xs" columnGap="sm" rowGap="xs">
                {tabs.length > 0 ? (
                  tabs.map(tabButton)
                ) : (
                  <Text color={PAL.muted} size="caption" weight="semibold">
                    DETAILS
                  </Text>
                )}
                <Box key="space" flexGrow={1} />
                {/* Updates: a button while a newer version waits on GitHub; the outcome stays beside it. */}
                {rel?.note ? (
                  <Text key="update-note" color={PAL.muted} size="caption">{rel.note}</Text>
                ) : null}
                {newer !== null && !rel?.note?.startsWith('updated') ? (
                  <Button key="usageband-update" label={`update to ${newer}`} onPress={() => void runUpdate($)} />
                ) : null}
                {/* The time left as a pill: a ring of what is left and the figure; or why a guard stopped it.
                    It comes first, so the controls after it never move when it appears. */}
                {timer ? (
                  <Box key="timer" flexShrink={0}>
                    <Svg source={timer.source} alt={timer.alt} width={timer.w} height={timer.h} />
                  </Box>
                ) : null}
                {/* Keep-warm: the button starts and stops the timer (the app's primary look while it
                    runs); the picker beside it only sets the length. Custom opens an hours field. */}
                <Button
                  key="usageband-keepwarm"
                  label="Keep warm"
                  {...(warmLeftMs > 0 ? { variant: 'primary' as const } : {})}
                  onPress={() => void flipKeepWarm($)}
                />
                {Select ? (
                  <Select
                    key="usageband-warm-hours"
                    options={keepWarmOptions(hours)}
                    value={ask !== null ? CUSTOM : String(hours)}
                    onSelect={value => void pickKeepWarm($, value)}
                  />
                ) : null}
                {ask !== null && Input ? (
                  <Input key="usageband-hours" placeholder="hours" submitLabel="set" autoFocus onSubmit={text => void typeHours($, text)} />
                ) : null}
                {ask ? (
                  <Text key="hours-hint" color={PAL.muted} size="caption">{ask}</Text>
                ) : null}
                {/* The mascot setting: the mascot itself, drawn, with a transparent Button laid over
                    it, since a Button draws text only. Tinted while on, faded while off. */}
                <Box key="mascot" flexShrink={0}>
                  <Svg source={face.source} alt={face.alt} width={MASCOT_ICON} height={MASCOT_ICON} />
                  <Box key="mascot-press" position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center">
                    <Button key="usageband-mascot" plain label={MASCOT_HIT} onPress={() => void flipMascot($)} />
                  </Box>
                </Box>
              </Box>
              {figures ? image('menu-svg', figures.source, figures.alt) : null}
              {a && (tab === null || tab === 'agents') ? (
                <Box key="agents" flexDirection="column" backgroundColor={AGENTS_FILL} borderStyle="round" borderColor={AGENTS_BORDER} marginX={1} marginBottom="xs">
                  <Box key="agents-head" flexDirection="row" alignItems="center" paddingX={1}>
                    <Text color={PAL.muted} size="caption" weight="semibold">
                      SUBAGENTS
                    </Text>
                    <Text color={PAL.ink} size="caption" weight="semibold">{` ${formatUsd(subTotal)}`}</Text>
                    <Text color={PAL.muted} size="caption">{` · ${v.agentRuns} ran · main ${formatUsd(Math.max(0, v.usd - subTotal))} · by cost`}</Text>
                    <Box key="agents-space" flexGrow={1} />
                    {/* Runs with no name: one chip each, or all in one chip; this button switches. */}
                    {v.unnamedRuns > 1 ? (
                      <Button
                        key="usageband-unnamed"
                        label={grouped ? 'Expand unnamed' : 'Collapse unnamed'}
                        onPress={() => void update($, groupUnnamed, x => !x)}
                      />
                    ) : null}
                    {a.pages > 1
                      ? [
                          <Button key="usageband-prev" plain label="‹" onPress={() => void turn(-1)()} />,
                          <Text key="count" color={PAL.muted} tabular>{` ${a.page + 1}/${a.pages} `}</Text>,
                          <Button key="usageband-next" plain label="›" onPress={() => void turn(1)()} />,
                        ]
                      : null}
                  </Box>
                  {/* Drawn interactive, so each chip's full name shows on hover; a frame needs its size given. */}
                  <Box key="agents-svg" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                    <Svg source={a.source} alt={a.alt} width={a.w} height={a.h} isInteractive />
                  </Box>
                </Box>
              ) : null}
            </Box>
          ) : null}
          {m ? <Svg key="gap" source={AIR_SVG} alt="" /> : null}
          <Box key="band" flexDirection="row" alignItems={wide ? 'center' : 'flex-start'}>
            {image('band-svg', b.source, b.alt)}
            <Box key="controls" flexDirection={wide ? 'row' : 'column'} alignItems="center" flexShrink={0}>
              {toggle}
              {toMini}
            </Box>
          </Box>
        </Box>
      )
    }

    const room = Math.max(10, cols - CONTROLS_ROW_CELLS - 4)
    // The menu opens upward here too: its rows come first, the band's last.
    const rows = [...(isOpen ? pack(menuItems(v), room) : []), ...pack(bandItems(v), room)]
    return (
      <Box flexDirection="row" paddingX={1} backgroundColor={PAL.surface}>
        <Box flexDirection="column" flexGrow={1}>
          {rows.map((row, r) => (
            <Box key={`r${r}`} flexDirection="row">
              {row.map((segs, i) => (
                <Box key={`i${i}`} flexDirection="row" flexShrink={0} marginLeft={i > 0 ? 3 : 0}>
                  {segs.map((s, k) =>
                    s.bold ? (
                      <Text key={`s${k}`} color={s.color} weight="bold">
                        {s.t}
                      </Text>
                    ) : (
                      <Text key={`s${k}`} color={s.color}>
                        {s.t}
                      </Text>
                    ),
                  )}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
        <Box key="controls" flexDirection="row" flexShrink={0}>
          {toggle}
          {toMini}
        </Box>
      </Box>
    )
  })
}
