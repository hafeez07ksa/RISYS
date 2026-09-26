/* Report fonts and images, registered once before the first render.
 *
 * The browser passes Vite-bundled asset URLs (see generate.js); the test
 * harness passes file paths. Templates read from here instead of importing
 * assets directly, so they render the same in both. The fonts ship inside the
 * app rather than coming from a CDN — a board pack must not fail to render
 * because an external host was blocked by a client's firewall.
 */
import { Font } from '@react-pdf/renderer'
import { isRtl } from '@/lib/i18n'

export const FONT_SANS = 'IBM Plex Sans'
export const FONT_DISPLAY = 'DM Serif Display'
// Registered in both languages and used as a per-glyph fallback, so Arabic
// data inside an English report still renders.
export const FONT_ARABIC = 'IBM Plex Sans Arabic'

const state = { registered: false, markLight: null, markDark: null }

export function registerReportAssets({ fonts, markLight, markDark }) {
  if (!state.registered) {
    // Arabic: IBM Plex Sans Arabic under the same family names, so templates
    // need no change. It has no italic and DM Serif has no Arabic glyphs, so
    // italic falls back to regular and display headings use the Arabic semibold.
    // (Language is fixed for the page's lifetime — switching reloads.)
    if (fonts.arRegular) {
      Font.register({
        family: FONT_ARABIC,
        fonts: [
          { src: fonts.arRegular,  fontWeight: 400 },
          { src: fonts.arRegular,  fontWeight: 400, fontStyle: 'italic' },
          { src: fonts.arMedium,   fontWeight: 500 },
          { src: fonts.arSemiBold, fontWeight: 600 },
          { src: fonts.arBold,     fontWeight: 700 },
        ],
      })
    }
    if (isRtl() && fonts.arRegular) {
      Font.register({
        family: FONT_SANS,
        fonts: [
          { src: fonts.arRegular,  fontWeight: 400 },
          { src: fonts.arRegular,  fontWeight: 400, fontStyle: 'italic' },
          { src: fonts.arMedium,   fontWeight: 500 },
          { src: fonts.arSemiBold, fontWeight: 600 },
          { src: fonts.arBold,     fontWeight: 700 },
        ],
      })
      // Semibold, not bold: registering the bold file under a second family
      // made some letters (ه) lose their joined forms in long documents.
      Font.register({ family: FONT_DISPLAY, src: fonts.arSemiBold })
    } else {
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
    }
    // Report text is English prose and IDs; hyphenating "NCA-ECC-2-2-3-2" or
    // a person's name mid-word reads as an error in a board document.
    Font.registerHyphenationCallback((word) => [word])
    state.registered = true
  }
  state.markLight = markLight ?? state.markLight
  state.markDark = markDark ?? state.markDark
}

export const reportAssets = () => state
