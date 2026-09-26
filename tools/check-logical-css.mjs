#!/usr/bin/env node
/* ── RTL guard ────────────────────────────────────────────────────────────────
 * Fails when physical left/right styling creeps back into the app. The UI is
 * written with logical properties (ms-/me-/ps-/pe-, start-/end-, text-start,
 * marginInlineStart, insetInlineEnd …) so it mirrors itself for Arabic; one
 * `ml-2` or `marginLeft` puts a gap on the wrong side in RTL.
 *
 *   npm run check:rtl
 *
 * Allowed on purpose (not reported):
 *   - src/lib/reports/**  — react-pdf styles, not DOM CSS
 *   - left/right whose value is not a literal (positions computed from
 *     getBoundingClientRect are physical by nature)
 *   - left-1/2, left: '50%' — centring
 *   - a line ending in   // rtl-ok   — deliberate, with the reason beside it
 * -------------------------------------------------------------------------- */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('../src/', import.meta.url).pathname
const SKIP = /[\\/]lib[\\/]reports[\\/]/
const RULES = [
  [/(?<![\w-])-?(?:ml|mr|pl|pr)-(?:\d|px|auto|\[)/, 'Tailwind physical margin/padding — use ms-/me-/ps-/pe-'],
  [/(?<![\w-])-?(?:left|right)-(?!1\/2)(?:\d|px|full|auto|\[)/, 'Tailwind left-/right- — use start-/end-'],
  [/(?<![\w-])text-(?:left|right)(?![\w-])/, 'text-left/right — use text-start/text-end'],
  [/(?<![\w-])(?:rounded-(?:l|r|tl|tr|bl|br)|border-(?:l|r))(?:-|\s|'|"|`|$)/, 'physical rounded-/border- side — use s/e variants'],
  [/\b(?:marginLeft|marginRight|paddingLeft|paddingRight|borderLeft\w*|borderRight\w*|border(?:Top|Bottom)(?:Left|Right)Radius)\s*:/, 'physical inline style — use the Inline/Start/End property'],
  [/\b(?:left|right)\s*:\s*(?:-?\d|'(?!50%)[^']*'|"(?!50%)[^"]*")/, "literal left/right — use insetInlineStart/insetInlineEnd"],
  [/textAlign\s*:\s*['"](?:left|right)['"]/, "textAlign 'left'/'right' — use 'start'/'end'"],
  [/(?:margin|padding|border)-(?:left|right)\s*:|(?:^|[;{\s])(?:left|right)\s*:\s*-?\d|text-align\s*:\s*(?:left|right)/, 'physical CSS property — use the logical one'],
]

const files = []
;(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(jsx?|css)$/.test(f) && !SKIP.test(p)) files.push(p)
  }
})(ROOT)

let problems = 0
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/)
  let inComment = false
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('/*')) inComment = true
    if (inComment) { if (t.includes('*/')) inComment = false; return }
    if (t.startsWith('//') || t.startsWith('*') || /rtl-ok\b/.test(line)) return
    for (const [re, msg] of RULES) {
      if (re.test(line)) {
        problems++
        console.log(`${relative(process.cwd(), f)}:${i + 1}  ${msg}\n    ${t.slice(0, 140)}`)
        break
      }
    }
  })
}
if (problems) {
  console.log(`\n${problems} physical left/right style(s). Use logical properties, or end the line with // rtl-ok and a reason.`)
  process.exit(1)
}
console.log(`RTL check passed — ${files.length} files, no physical left/right styling.`)
