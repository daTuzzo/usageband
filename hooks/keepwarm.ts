import type { KeepWarm, UsagebandLimit } from '../types'
import { PRICES, nextMessageCost } from './pricing'
import type { CacheState, Family } from './pricing'

// Keep-warm: a cold send re-writes the whole context (2x the input price), a warm one
// only reads it (about 1/40 of that on Opus), so pinging once an hour is cheap next to
// one cold send. These are its decisions, kept free of the engine so they can be tested.

/**
 * A ping goes out once this long has passed since the last request: with 2 minutes or less
 * left on the 1-hour cache. On a 10-second tick that gives 12 chances before it expires.
 */
export const PING_AFTER_MS = 58 * 60_000
/** The keep-warm picker's lengths, in hours; "custom" takes any length from MIN_HOURS to MAX_HOURS. */
export const KEEP_WARM_HOURS = [4, 8, 12, 24]
/** The length picked until the person picks another. */
export const DEFAULT_HOURS = 8
export const MIN_HOURS = 1
/** Past this, pings cost more than a cold send on every model (Fable breaks even near 72 h). */
export const MAX_HOURS = 72
/** Below this cold-send price the cache is not worth keeping. */
export const MIN_COLD_USD = 1
/**
 * Pings stop once they have cost this share of one cold send: past it, letting the cache
 * go cold is cheaper. On Opus that is about 38 h of pings, on Sonnet about 18 h.
 */
export const BUDGET_SHARE = 1
/** No pings while a limit has less than this percent left. */
export const MIN_5H_LEFT = 10
export const MIN_7D_LEFT = 5
/** A ping whose turn has not finished after this long no longer holds the next one back. */
export const PING_STALE_MS = 10 * 60_000
export const PING_TEXT = 'cache ping, reply ok'

const HOUR_MS = 3_600_000

/** The cache as keep-warm needs it: warm or cold, time since the last send, its size and model. */
export type CacheNow = { state: CacheState; idleMs: number; tokens: number; family: Family | null }

/**
 * The timer runs `hours` from now. A running timer keeps its pings and what they cost,
 * so a new length never resets the budget; a stopped one starts afresh.
 */
export const startKeepWarm = (kw: KeepWarm | null, hours: number, now: number): KeepWarm =>
  kw === null || kw.until <= now
    ? { hours, until: now + hours * HOUR_MS, pings: 0, spent: 0, pendingAt: 0, note: null }
    : { ...kw, hours, until: now + hours * HOUR_MS, note: null }

/** The timer stops, with no reason to show. */
export const offKeepWarm = (kw: KeepWarm | null): KeepWarm | null => (kw === null ? null : { ...kw, until: 0, pendingAt: 0, note: null })

/** The Keep warm button: a stopped timer starts for the picked length, a running one stops. */
export const toggleKeepWarm = (kw: KeepWarm | null, hours: number, now: number): KeepWarm | null =>
  kw !== null && kw.until > now ? offKeepWarm(kw) : startKeepWarm(kw, hours, now)

/** A new length picked: a running timer runs that long from now; a stopped one stays stopped. */
export const retimeKeepWarm = (kw: KeepWarm | null, hours: number, now: number): KeepWarm | null =>
  kw !== null && kw.until > now ? startKeepWarm(kw, hours, now) : kw

/** A typed length ("6", "6h", "1.5 h") in hours, or null when it is no number from MIN_HOURS to MAX_HOURS. */
export const parseHours = (text: string): number | null => {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*h?\s*$/i.exec(text)
  if (m === null || m[1] === undefined) return null
  const hours = Math.round(Number(m[1].replace(',', '.')) * 10) / 10
  return hours >= MIN_HOURS && hours <= MAX_HOURS ? hours : null
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
  // A running turn uses the cache anyway. A turn that sent nothing for 10 minutes is taken
  // as ended: an interrupted turn may never report its end, and must not hold pings back.
  if (turnOpen && (cache === null || cache.idleMs < PING_STALE_MS)) return { act: 'wait' }
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
