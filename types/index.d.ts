/** A rate-limit window as the band keeps it: its kind, how much is spent (0 to 100), and when it starts over. */
export type UsagebandLimit = { kind: string; usedPct: number; resetsAt?: string }

/**
 * The prompt cache's clock: when the main thread last sent the model a request
 * (clock milliseconds), how large its context was, the context window it fits
 * in, and which model took it.
 */
export type CacheClock = { sentAt: number; contextTokens: number; contextWindow: number; model: string | null }

/** Running totals for the session: prompts sent, and tokens over every turn, subagents' turns included. */
export type UsagebandCounters = { prompts: number; input: number; output: number; cacheRead: number; cacheWrite: number }

/** Dollars spent by each subagent, keyed by its agent id. */
export type UsagebandAgents = Record<string, number>

/** What the mod shows: nothing above the prompt (mini), the band, or the band with its menu. Remembered in $.store. */
export type UsagebandView = 'mini' | 'band' | 'open'

/**
 * Keep-warm, for this session only: pings the main thread one minute before the
 * 1-hour cache expires, until `until` (clock milliseconds; 0 once stopped). `hours`
 * is the timer chosen, `pings` and `spent` (dollars) what it has used, `pendingAt`
 * when the ping in flight went out (0 for none), and `note` why it stopped.
 */
export type KeepWarm = { hours: number; until: number; pings: number; spent: number; pendingAt: number; note: string | null }

declare module "claude-code" {
  export interface PluginState {
    usageband: {
      limits: UsagebandLimit[]
      cacheClock: CacheClock | null
      counters: UsagebandCounters
      agentSpend: UsagebandAgents
      view: UsagebandView
      /** The menu's page of subagents, counting from 0. */
      page: number
      /** Whether the cache chip shows the mascot. Mirrors $.store's showMascot, so a change redraws the band. */
      mascot: boolean
      /** The keep-warm timer, or null while it has never been switched on. */
      keepWarm: KeepWarm | null
    }
  }
}
