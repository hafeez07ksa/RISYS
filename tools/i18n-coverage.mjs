#!/usr/bin/env node
/* ── Arabic coverage report ───────────────────────────────────────────────────
 * Lists every tx('…') string in src/ that has no entry in src/locales/ar.json.
 * Missing strings still work — they show in English — so this is a to-do
 * list, not a failure. Pass --strict to exit non-zero (for CI once coverage is
 * where you want it).
 *
 *   npm run check:i18n            # report
 *   npm run check:i18n -- --json  # machine-readable, e.g. to hand to a translator
 * -------------------------------------------------------------------------- */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const ar = JSON.parse(readFileSync(join(SRC, 'locales/ar.json'), 'utf8'))
const CALL = /\btx\(\s*(['"])((?:\\.|(?!\1).)*)\1/g

const found = new Map()
;(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.jsx?$/.test(f)) {
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(CALL)) {
        const key = m[2].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n')
        if (!found.has(key)) found.set(key, relative(SRC, p))
      }
    }
  }
})(SRC)

const missing = [...found].filter(([k]) => !(k in ar))
const pct = found.size ? Math.round(100 * (found.size - missing.length) / found.size) : 100
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(Object.fromEntries(missing.map(([k]) => [k, ''])), null, 1))
} else {
  for (const [k, f] of missing) console.log(`${f}\t${k}`)
  console.log(`\nArabic coverage: ${found.size - missing.length}/${found.size} strings (${pct}%). ${missing.length} missing — they display in English.`)
}
if (process.argv.includes('--strict') && missing.length) process.exit(1)
