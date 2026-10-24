// What each model family charges, how long the prompt cache keeps a conversation,
// and money as text. Nothing here touches the engine.

/** Whether the prompt cache still holds the conversation (warm) or has let it go (cold). */
export type CacheState = 'warm' | 'cold'

/** The prompt cache keeps a conversation for one hour after the last request that used it. */
export const CACHE_TTL_MS = 60 * 60_000

export type Family = 'fable' | 'opus' | 'sonnet' | 'haiku'

/**
 * US dollars per million tokens, by kind of token. `cacheWrite` is the 1-hour cache write,
 * `cacheWrite5m` the 5-minute one.
 */
export type Rates = { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite5m: number }

/**
 * How long a request's cache writes last: the main thread writes the 1-hour cache, a
 * subagent the 5-minute one (every write in the transcripts, 2026-10-24).
 */
export type CacheTtl = '1h' | '5m'

/** The families in the order the band lists them. */
export const FAMILIES: readonly Family[] = ['fable', 'opus', 'sonnet', 'haiku']

// Anthropic's list prices. cacheWrite is the 1-hour write (twice the input price), the one
// Claude Code's main thread uses; cacheWrite5m (1.25x input) is what subagents write. Haiku
// is at its rate above 100K tokens, which long sessions pay.
// List prices checked 2026-10-23 against the Claude API reference (cached 2026-10-06); both
// write rates match the pricing tiers in Claude Code 2.1.308's own model catalog.
export const PRICES: Record<Family, Rates> = {
  fable: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 20, cacheWrite5m: 12.5 },
  opus: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 8, cacheWrite5m: 5 },
  sonnet: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 4, cacheWrite5m: 2.5 },
  haiku: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 1, cacheWrite5m: 0.625 },
}

/** The family a model id belongs to ("claude-opus-5-5" is opus), or null for one not priced here. */
export const familyFor = (modelId: string | null | undefined): Family | null => {
  const id = (modelId ?? '').toLowerCase()
  for (const fam of FAMILIES) if (id.includes(fam)) return fam
  return null
}

/** The rates a model id is billed at, or null when its family is not priced here. */
export const priceFor = (modelId: string | null | undefined): Rates | null => {
  const fam = familyFor(modelId)
  return fam === null ? null : PRICES[fam]
}

/**
 * What one more message costs before its own reply, over a context of `tokens`:
 * warm, the cache serves the context at the read price; cold, it is all written
 * to the cache again.
 */
export const nextMessageCost = (rates: Rates, warm: boolean, tokens: number): number =>
  (tokens * (warm ? rates.cacheRead : rates.cacheWrite)) / 1e6

/** A request's token counts, named the way the engine reports them. */
export type TokenCounts = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

/**
 * What a request's tokens cost at its model's rates, its cache writes at the rate of the
 * cache they went to (1-hour unless said); 0 for a model not priced here.
 */
export const requestCost = (modelId: string | null | undefined, counts: TokenCounts, ttl: CacheTtl = '1h'): number => {
  const rates = priceFor(modelId)
  if (rates === null) return 0
  const dollars =
    counts.input_tokens * rates.input +
    counts.output_tokens * rates.output +
    counts.cache_read_input_tokens * rates.cacheRead +
    counts.cache_creation_input_tokens * (ttl === '1h' ? rates.cacheWrite : rates.cacheWrite5m)
  return dollars / 1e6
}

/** An amount of US dollars, to the cent: "$3.42". */
export const formatUsd = (amount: number): string => `$${amount.toFixed(2)}`
