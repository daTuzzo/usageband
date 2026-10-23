// Checks the update check's version logic. Run: npx -y tsx tests/update.check.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { isNewer, versionOf } from '../hooks/update'

assert.equal(isNewer('0.16.0', '0.15.3'), true)
assert.equal(isNewer('0.15.10', '0.15.9'), true, 'numbers, not text: 10 is above 9')
assert.equal(isNewer('1.0.0', '0.99.99'), true)
assert.equal(isNewer('0.15.3', '0.15.3'), false)
assert.equal(isNewer('0.15.2', '0.15.3'), false)

assert.equal(versionOf('{"name":"usageband","version":"0.16.0"}'), '0.16.0')
assert.equal(versionOf('{"name":"usageband"}'), null)
assert.equal(versionOf('not json'), null)
assert.equal(versionOf('{"version":"latest"}'), null)

// The shipped manifest must carry a version the check can read.
const shipped = versionOf(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'))
assert.ok(shipped !== null, 'plugin.json has an x.y.z version')
console.log(`update checks passed (installed manifest says ${shipped})`)
