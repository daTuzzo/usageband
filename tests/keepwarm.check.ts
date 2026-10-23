// Checks keep-warm's decisions by simulating whole idle stretches on a 10-second tick,
// the way the mod runs them. Run: npx -y tsx tests/keepwarm.check.ts
import assert from 'node:assert/strict'

import type { KeepWarm, UsagebandLimit } from '../types'
import { PING_AFTER_MS, keepWarmStep, nextKeepWarm, pingCost, pingFoundCold } from '../hooks/keepwarm'
import { CACHE_TTL_MS } from '../hooks/pricing'
import type { Family } from '../hooks/pricing'

const MIN = 60_000
const HOUR = 60 * MIN
const TICK = 10_000
const OK_LIMITS: UsagebandLimit[] = [
  { kind: 'five_hour', usedPct: 20 },
  { kind: 'seven_day', usedPct: 30 },
]

type Run = { pings: number[]; stop: string | null; spent: number }

/** Idles from `t0` with keep-warm on; each ping's turn takes 5 s and refreshes the cache. */
const simulate = (kw: KeepWarm, family: Family, tokens: number, limits = OK_LIMITS, hours = 10): Run => {
  let state: KeepWarm = kw
  let sentAt = 0
  const pings: number[] = []
  for (let now = 0; now <= hours * HOUR; now += TICK) {
    const idleMs = now - sentAt
    const cache = { state: idleMs < CACHE_TTL_MS ? ('warm' as const) : ('cold' as const), idleMs, tokens, family }
    const step = keepWarmStep(state, cache, limits, now, false)
    if (step.act === 'stop') return { pings, stop: step.note, spent: state.spent }
    if (step.act === 'ping') {
      pings.push(now)
      sentAt = now // the ping's request reads the cache and starts its hour again
      state = { ...state, pings: state.pings + 1, spent: state.spent + pingCost(family, tokens), pendingAt: 0 }
    }
  }
  return { pings, stop: null, spent: state.spent }
}

const on = (hours: number): KeepWarm => ({ hours, until: hours * HOUR, pings: 0, spent: 0, pendingAt: 0, note: null })
const at = (ms: number): string => `${Math.floor(ms / HOUR)}h${String(Math.floor((ms % HOUR) / MIN)).padStart(2, '0')}`

// The button: off, 2 h, 4 h, 8 h, off.
{
  const a = nextKeepWarm(null, 0)
  const b = nextKeepWarm(a, 1000)
  const c = nextKeepWarm(b, 2000)
  const d = nextKeepWarm(c, 3000)
  assert.deepEqual([a.hours, b.hours, c.hours, d.until], [2, 4, 8, 0])
  assert.equal(nextKeepWarm(d, 4000).hours, 2, 'a press after off starts again at 2 h')
  console.log('button cycles off, 2h, 4h, 8h, off')
}

// Your session: Opus, 688k tokens in the cache.
{
  const r = simulate(on(2), 'opus', 688_000)
  assert.equal(r.pings.length, 2)
  assert.ok(r.pings[0]! >= PING_AFTER_MS && r.pings[0]! < PING_AFTER_MS + TICK, 'first ping in the tick after 59 min')
  assert.equal(r.stop, 'timer done')
  console.log(`opus 688k, 2h timer: pings at ${r.pings.map(at).join(', ')}, $${r.spent.toFixed(2)}, stops: ${r.stop}`)
}
{
  const r = simulate(on(8), 'opus', 688_000)
  assert.equal(r.pings.length, 8)
  assert.equal(r.stop, 'timer done')
  console.log(`opus 688k, 8h timer: ${r.pings.length} pings, $${r.spent.toFixed(2)} (one cold send costs $5.50), stops: ${r.stop}`)
}

// The budget stops it before the timer: Sonnet re-caches for less, so half a cold send is fewer pings.
{
  const r = simulate({ ...on(8), until: 100 * HOUR }, 'sonnet', 688_000, OK_LIMITS, 100)
  assert.equal(r.stop, 'budget used')
  assert.ok(r.spent <= 2.75 / 2 + 1e-9, 'never spends more than half a cold send')
  console.log(`sonnet 688k, long timer: ${r.pings.length} pings, $${r.spent.toFixed(2)}, stops: ${r.stop}`)
}

// Small contexts are not worth keeping.
{
  const r = simulate(on(8), 'opus', 100_000)
  assert.deepEqual([r.pings.length, r.stop], [0, 'cache too small to keep'])
  console.log(`opus 100k: no ping, stops: ${r.stop}`)
}

// Usage guard.
{
  const r = simulate(on(8), 'opus', 688_000, [{ kind: 'five_hour', usedPct: 95 }, { kind: 'seven_day', usedPct: 30 }])
  assert.deepEqual([r.pings.length, r.stop], [0, 'usage low'])
  console.log(`5h at 5% left: no ping, stops: ${r.stop}`)
}

// A running turn holds pings back; a cache that already went cold stops it.
{
  const kw = on(8)
  const warm = { state: 'warm' as const, idleMs: PING_AFTER_MS + 5000, tokens: 688_000, family: 'opus' as const }
  assert.equal(keepWarmStep(kw, { ...warm, idleMs: 2 * MIN }, OK_LIMITS, 2 * MIN, true).act, 'wait')
  const cold = { ...warm, state: 'cold' as const, idleMs: CACHE_TTL_MS + 1 }
  assert.deepEqual(keepWarmStep(kw, cold, OK_LIMITS, CACHE_TTL_MS + 1, false), { act: 'stop', note: 'cache went cold' })
  assert.equal(keepWarmStep(null, warm, OK_LIMITS, 0, false).act, 'idle')
  console.log('a running turn waits; a cold cache stops it; off stays idle')
}

// A turn flag left on (an interrupted turn that never reported its end) must not hold pings back.
{
  const kw = on(8)
  const due = { state: 'warm' as const, idleMs: PING_AFTER_MS + 5000, tokens: 688_000, family: 'opus' as const }
  assert.equal(keepWarmStep(kw, due, OK_LIMITS, PING_AFTER_MS + 5000, true).act, 'ping')
  const recent = { ...due, idleMs: 3 * MIN }
  assert.equal(keepWarmStep(kw, recent, OK_LIMITS, 3 * MIN, true).act, 'wait')
  console.log('a stuck turn flag does not block a due ping; a live turn still waits')
}

// After a ping: a cache write bigger than the read means the cache had gone.
assert.equal(pingFoundCold(688_000, 0), true)
assert.equal(pingFoundCold(250, 688_000), false)
console.log('a ping that re-wrote the cache is caught')

console.log('all keep-warm checks passed')
