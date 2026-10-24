// Checks request pricing: cache writes at the rate of the cache they went to.
// Run: npx -y tsx tests/pricing.check.ts
import assert from 'node:assert/strict'

import { PRICES, requestCost } from '../hooks/pricing'

const writes = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 1_000_000 }

// The 1-hour write is twice the input price, the 5-minute one 1.25 times, on every family.
for (const [family, r] of Object.entries(PRICES)) {
  assert.equal(r.cacheWrite, r.input * 2, `${family} 1-hour write`)
  assert.equal(r.cacheWrite5m, r.input * 1.25, `${family} 5-minute write`)
}

// The main thread's writes (1 hour, the default) and a subagent's (5 minutes), on Opus.
assert.equal(requestCost('claude-opus-5-5', writes), 8)
assert.equal(requestCost('claude-opus-5-5', writes, '5m'), 5)
assert.equal(requestCost('some-other-model', writes), 0, 'a model not priced here costs 0')
console.log('pricing checks passed: opus 1M written costs $8 for 1 hour, $5 for 5 minutes')
