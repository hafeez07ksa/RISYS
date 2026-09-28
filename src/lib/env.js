/* Build-time environment.
 *
 * RISYS is deployed as two separate builds from this one source tree:
 *
 *   VITE_APP_MODE=app      → app.risysgrc.com      the tenant application
 *   VITE_APP_MODE=console  → console.risysgrc.com  the platform console
 *
 * The mode decides which routes are compiled in, so the console's code is not
 * shipped to client browsers at all and /platform does not exist on the tenant
 * host. Unset (local development) builds both, so one dev server serves
 * everything at localhost:5173.
 *
 * VITE_APP_URL must always point at the tenant application, on both builds:
 * invitation and activation links are generated in the console but opened by
 * the client, so they can never be derived from window.location.origin.
 */

const MODE = import.meta.env.VITE_APP_MODE || 'all'

export const IS_CONSOLE_BUILD = MODE === 'console'
export const IS_APP_BUILD = MODE === 'app'
export const BUILD_MODE = MODE

/* Public URL of the tenant app. Falls back to the current origin so local
 * development and preview deployments keep working without configuration. */
export const APP_URL = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/+$/, '')

/* Where a person accepts an invitation — always on the tenant app. */
export const inviteUrl = (token) => `${APP_URL}/invite/${token}`

/* The OAuth callback registered with Entra, Jira and Google. It must match the
 * redirect URI in each provider's app registration exactly, so it is fixed at
 * build time rather than read from the browser. */
export const OAUTH_REDIRECT_URI =
  import.meta.env.VITE_OAUTH_REDIRECT_URI || `${APP_URL}/oauth/callback`
