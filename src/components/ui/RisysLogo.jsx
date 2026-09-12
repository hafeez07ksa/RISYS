import markDark from '@/assets/risys-mark.png'
import markLight from '@/assets/risys-mark-light.png'

/* ── Wordmark ─────────────────────────────────────────────────────────────────
 *
 * The real brand assets, not an approximation. The mark is the R letterform
 * with its orbit ring and terminal dot; it ships in two cuts because the ring
 * is a deep wine that disappears against the sidebar, so the sidebar gets the
 * cream cut rather than a recoloured version of the dark one.
 *
 * Both files are cropped to their alpha bounding box. The supplied artwork sat
 * inside a 1050×600 frame that was about 70% empty padding — rendered at 26px
 * the glyph itself would have been roughly 9px and looked like a smudge.
 *
 * The word RISYS is set as live text rather than shipped as an image: it has to
 * stay crisp at every zoom level, be selectable, and read to a screen reader.
 * The brand sets it in a light serif with wide tracking, which --font-display
 * plus the tracking below matches closely.
 */

// Sampled from the supplied artwork rather than guessed.
export const BRAND = {
  ink:   '#251518',   // letterform
  wine:  '#4C0C25',   // orbit ring and dot
  cream: '#F8F4EA',   // the light cut
}

const SIZES = {
  xs: { mark: 20, font: 13, track: '0.20em' },
  sm: { mark: 26, font: 15, track: '0.20em' },
  md: { mark: 32, font: 18, track: '0.18em' },
  lg: { mark: 44, font: 25, track: '0.16em' },
}

/**
 * @param size     xs | sm | md | lg
 * @param tone     'dark' on light grounds, 'light' on the sidebar
 * @param showText hide the word to leave the mark alone (collapsed sidebar)
 * @param tagline  show "Risk Intelligence System" beneath — sign-in, invites
 */
export function RisysLogo({ size = 'md', tone = 'dark', showText = true, tagline = false }) {
  const s = SIZES[size] || SIZES.md
  const light = tone === 'light'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s.mark * 0.34 }}>
      <img
        src={light ? markLight : markDark}
        alt=""
        aria-hidden="true"
        width={s.mark}
        height={s.mark}
        style={{ width: s.mark, height: s.mark, objectFit: 'contain', flexShrink: 0, display: 'block' }}
      />

      {showText && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="display"
            style={{
              fontSize: s.font,
              lineHeight: 1,
              letterSpacing: s.track,
              /* Wide tracking adds space to the right of the final S too, which
                 pushes the word off its optical centre. Pull it back. */
              marginRight: `-${s.track}`,
              color: light ? BRAND.cream : BRAND.ink,
              whiteSpace: 'nowrap',
            }}
          >
            RISYS
          </span>

          {tagline && (
            <span
              style={{
                fontSize: Math.max(7.5, s.font * 0.36),
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: light ? BRAND.cream : 'var(--text-3)',
                opacity: light ? 0.72 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              Risk Intelligence System
            </span>
          )}
        </span>
      )}
    </div>
  )
}
