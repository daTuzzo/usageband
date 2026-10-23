// Checks that the band never drops its dot bars: at every width, with the mascot off
// and on, 5H, 7D and the cache each keep at least 4 dots. Run: npx -y tsx tests/band.check.ts
import assert from 'node:assert/strict'

import { bandSvg } from '../hooks/art'
import type { BandView } from '../hooks/art'

const v: BandView = {
  h5: { left: 98, reset: '5m', at: '00:30' },
  d7: { left: 71, reset: '6d19h', at: 'Thu 22:00' },
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
  mascot: false,
}

for (const mascot of [false, true]) {
  for (let w = 240; w <= 1200; w += 20) {
    const b = bandSvg({ ...v, mascot }, w)
    const dots = (b.source.match(/<circle/g) ?? []).length
    assert.ok(dots >= 3 * 4, `${w}px, mascot ${mascot ? 'on' : 'off'}: only ${dots} dots`)
  }
}
console.log('the band keeps its dot bars at every width from 240 to 1200 px, mascot off and on')
