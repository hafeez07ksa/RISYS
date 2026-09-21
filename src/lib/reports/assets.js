/* Report fonts and images, registered once before the first render.
 *
 * The browser passes Vite-bundled asset URLs (see generate.js); the test
 * harness passes file paths. Templates read from here instead of importing
 * assets directly, so they render the same in both. The fonts ship inside the
 * app rather than coming from a CDN — a board pack must not fail to render
 * because an external host was blocked by a client's firewall.
 */
import { Font } from '@react-pdf/renderer'

export const FONT_SANS = 'IBM Plex Sans'
export const FONT_DISPLAY = 'DM Serif Display'

const state = { registered: false, markLight: null, markDark: null }

export function registerReportAssets({ fonts, markLight, markDark }) {
  if (!state.registered) {
    Font.register({
      family: FONT_SANS,
      fonts: [
        { src: fonts.regular,  fontWeight: 400 },
        { src: fonts.italic,   fontWeight: 400, fontStyle: 'italic' },
        { src: fonts.medium,   fontWeight: 500 },
        { src: fonts.semibold, fontWeight: 600 },
        { src: fonts.bold,     fontWeight: 700 },
      ],
    })
    Font.register({ family: FONT_DISPLAY, src: fonts.display })
    // Report text is English prose and IDs; hyphenating "NCA-ECC-2-2-3-2" or
    // a person's name mid-word reads as an error in a board document.
    Font.registerHyphenationCallback((word) => [word])
    state.registered = true
  }
  state.markLight = markLight ?? state.markLight
  state.markDark = markDark ?? state.markDark
}

export const reportAssets = () => state
