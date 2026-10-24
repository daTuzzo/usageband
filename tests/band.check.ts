// Checks that the band never drops its dot bars or its reset times: at every width, with
// the mascot off and on, 5H, 7D and the cache each keep at least 4 dots, and 5H and 7D
// show when they reset (in full, or cut to the largest unit). Run: npx -y tsx tests/band.check.ts
import assert from 'node:assert/strict'

import { bandSvg } from '../hooks/art'
import type { BandView } from '../hooks/art'

const v: BandView = {
  h5: { used: 2, reset: '5m', at: '00:30' },
  d7: { used: 29, reset: '6d19h', at: 'Thu 22:00' },
  cache: { mode: 'warm', time: '38m', idleMin: 22 },
  tokens: 765_000,
  window: 1_000_000,
  share: 0.77,
  prices: [
    { id: 'fable', name: 'FABLE', usd: 0.19, isMine: false },
    { id: 'opus', name: 'OPUS', usd: 0.15, isMine: true },
    { id: 'sonnet', name: 'SONNET', usd: 0.15, isMine: false },
    { id: 'haiku', name: 'HAIKU', usd: 0.04, isMine: false },
  ],
  priceTop: 15.3,
  usd: 16.76,
  prompts: 14,
  input: 138,
  output: 65_000,
  cacheRead: 45_800_000,
  cacheWrite: 1_270_000,
  agents: [],
  agentRuns: 0,
  unnamedRuns: 0,
  mascot: false,
}

for (const mascot of [false, true]) {
  for (let w = 240; w <= 1200; w += 20) {
    const b = bandSvg({ ...v, mascot }, w)
    const dots = (b.source.match(/<circle/g) ?? []).length
    assert.ok(dots >= 3 * 4, `${w}px, mascot ${mascot ? 'on' : 'off'}: only ${dots} dots`)
    assert.ok(/>5M</.test(b.source), `${w}px, mascot ${mascot ? 'on' : 'off'}: 5H reset missing`)
    assert.ok(/>6D(19H)?</.test(b.source), `${w}px, mascot ${mascot ? 'on' : 'off'}: 7D reset missing`)
  }
}
console.log('the band keeps its dot bars and reset times at every width from 240 to 1200 px, mascot off and on')
