// Update check: compares the installed version with the newest one on GitHub, and
// names the commands that update the plugin through Claude Code itself.

/** The newest plugin.json, from the repository's main branch. */
export const LATEST_URL = 'https://raw.githubusercontent.com/daTuzzo/usageband/main/.claude-plugin/plugin.json'
/** How often a session looks again. */
export const CHECK_EVERY_MS = 6 * 3_600_000
/** Claude Code's own update commands, run in order: refresh the catalog, then update the plugin. */
export const UPDATE_STEPS: readonly (readonly string[])[] = [
  ['claude', 'plugin', 'marketplace', 'update', 'usageband'],
  ['claude', 'plugin', 'update', 'usageband@usageband'],
]
export const MANUAL_UPDATE = 'claude plugin update usageband@usageband'

/** The `version` of a plugin.json text, or null when it has none in x.y.z form. */
export const versionOf = (text: string): string | null => {
  try {
    const v: unknown = (JSON.parse(text) as { version?: unknown }).version
    return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : null
  } catch {
    return null
  }
}

/** True when version `a` is higher than version `b` (both x.y.z). */
export const isNewer = (a: string, b: string): boolean => {
  const pa = a.split('.').map(n => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}
