/* Resolves the '@/…' alias for scripts that run under plain Node.
 *
 * Vite maps '@' to src/ and fills in the file extension; tools/gate-check.mjs
 * runs the gate engine with no build step, so it needs both. Registered by
 * alias-loader.mjs, which is passed to node with --import.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = new URL('../src/', import.meta.url)

export async function resolve(specifier, context, next) {
  if (!specifier.startsWith('@/')) return next(specifier, context)

  const base = new URL(specifier.slice(2), SRC)

  // Vite imports JSON with a bare specifier; Node requires an import
  // attribute, so add it here rather than changing the source.
  if (base.href.endsWith('.json')) {
    return { url: base.href, format: 'json', importAttributes: { type: 'json' }, shortCircuit: true }
  }
  // Source files import without an extension, the way a bundler allows.
  for (const candidate of [base.href, `${base.href}.js`, `${base.href}.jsx`, `${base.href}/index.js`]) {
    if (existsSync(fileURLToPath(candidate))) return next(candidate, context)
  }
  return next(base.href, context)
}
