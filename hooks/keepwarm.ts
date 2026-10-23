import type { KeepWarm, UsagebandLimit } from '../types'
import { PRICES, nextMessageCost } from './pricing'
import type { CacheState, Family } from './pricing'

// Keep-warm: a cold send re-writes the whole context (2x the input price), a warm one
// only reads it (about 1/40 of that on Opus), so pinging once an hour is cheap next to
// one cold send. These are its decisions, kept free of the engine so they can be tested.

/** A ping goes out this long after the last request: one minute before the 1-hour cache expires. */
export const PING_AFTER_MS = 59 * 60_000
/** Each press of the keep-warm button steps through these timers, in hours, then off. */
export const KEEP_WARM_HOURS = [2, 4, 8]
/** Below this cold-send price the cache is not worth keeping. */
export const MIN_COLD_USD = 1
/** Pings stop once they have cost this share of one cold send, so the worst case loses half of one. */
export const BUDGET_SHARE = 0.5
/** No pings while a limit has less than this percent left. */
export const MIN_5H_LEFT = 10
export const MIN_7D_LEFT = 5
/** A ping whose turn has not finished after this long no longer holds the next one back. */
export const PING_STALE_MS = 10 * 60_000
export const PING_TEXT = 'usageband keep-warm ping: reply with only the word ok, and do nothing else.'

const HOUR_MS = 3_600_000

/** The cache as keep-warm needs it: warm or cold, time since the last send, its size and model. */
export type CacheNow = { state: CacheState; idleMs: number; tokens: number; family: Family | null }

/** One press: off, then 2 h, 4 h, 8 h, then off again. Each press restarts the timer from now. */
export const nextKeepWarm = (kw: KeepWarm | null, now: number): KeepWarm => {
  const first = KEEP_WARM_HOURS[0] ?? 2
  if (kw === null || kw.until <= now) return { hours: first, until: now + first * HOUR_MS, pings: 0, spent: 0, pendingAt: 0, note: null }
  const hours = KEEP_WARM_HOURS.find(h => h > kw.hours)
  return hours === undefined ? { ...kw, until: 0, pendingAt: 0, note: null } : { ...kw, hours, until: now + hours * HOUR_MS, note: null }
}

/** What one ping costs: a read of the whole cache, plus its own line in and a one-word reply out. */
export const pingCost = (family: Family, tokens: number): number => {
  const rates = PRICES[family]
  return nextMessageCost(rates, true, tokens) + (60 * rates.input + 40 * rates.output) / 1e6
}

export type KeepWarmStep = { act: 'idle' } | { act: 'wait' } | { act: 'ping' } | { act: 'stop'; note: string }

/** Decides, on one tick, whether to send a ping now, wait, or stop for good. */
export const keepWarmStep = (
  kw: KeepWarm | null,
  cache: CacheNow | null,
  limits: readonly UsagebandLimit[],
  now: number,
  turnOpen: boolean,
): KeepWarmStep => {
  if (kw === null || kw.until <= 0) return { act: 'idle' }
  if (now >= kw.until) return { act: 'stop', note: 'timer done' }
  if (turnOpen) return { act: 'wait' } // a running turn uses the cache anyway
  if (kw.pendingAt > 0 && now - kw.pendingAt < PING_STALE_MS) return { act: 'wait' }
  if (cache === null || cache.idleMs < PING_AFTER_MS) return { act: 'wait' }
  if (cache.state === 'cold') return { act: 'stop', note: 'cache went cold' }
  if (cache.family === null) return { act: 'stop', note: 'model not priced' }
  const coldUsd = nextMessageCost(PRICES[cache.family], false, cache.tokens)
  if (coldUsd < MIN_COLD_USD) return { act: 'stop', note: 'cache too small to keep' }
  if (kw.spent + pingCost(cache.family, cache.tokens) > coldUsd * BUDGET_SHARE) return { act: 'stop', note: 'budget used' }
  const left = (kind: string): number => 100 - (limits.find(x => x.kind === kind)?.usedPct ?? 0)
  if (left('five_hour') < MIN_5H_LEFT || left('seven_day') < MIN_7D_LEFT) return { act: 'stop', note: 'usage low' }
  return { act: 'ping' }
}

/** After a ping's turn: true when it wrote the cache instead of reading it, so the cache had already gone. */
export const pingFoundCold = (cacheWrite: number, cacheRead: number): boolean => cacheWrite > cacheRead
