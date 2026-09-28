/* Copies the right _headers file into the build output.
 *
 *   node scripts/postbuild.mjs app
 *   node scripts/postbuild.mjs console
 *
 * The two builds need different headers (the console is noindex), and a file
 * in public/ would be shared by both, so the copy happens after the build.
 */
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const mode = process.argv[2]
if (!['app', 'console'].includes(mode)) {
  console.error('Usage: node scripts/postbuild.mjs <app|console>')
  process.exit(1)
}

const src = join('deploy', 'headers', `_headers.${mode}`)
const outDir = join('dist', mode)
if (!existsSync(outDir)) {
  console.error(`Build output ${outDir} not found — run the build first.`)
  process.exit(1)
}
copyFileSync(src, join(outDir, '_headers'))

// The console must never be indexed; the tenant app has nothing crawlable
// behind the login either.
writeFileSync(join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n')

console.log(`postbuild: ${mode} → ${outDir} (_headers, robots.txt)`)
