/* ── Direction-aware react-pdf primitives ────────────────────────────────────
 *
 * Reports are generated in the interface language. For Arabic the whole
 * document mirrors: rows run right-to-left, text is right-aligned with an RTL
 * paragraph direction, and left/right padding, margins, borders and offsets
 * swap sides. react-pdf has no document-level direction (its Yoga layout is
 * always LTR and `direction` is not an inherited style), so the templates
 * import View/Text from here instead of from '@react-pdf/renderer' and every
 * style is mirrored as it is drawn. English output is untouched.
 *
 * Arabic is never letter-spaced (it breaks the joining of letters), so
 * letterSpacing is dropped in RTL.
 * -------------------------------------------------------------------------- */
import { View as PdfView, Text as PdfText } from '@react-pdf/renderer'
import { isRtl, tx } from '@/lib/i18n'
import { FONT_ARABIC } from './assets'
import { Children, Fragment, cloneElement, isValidElement } from 'react'

const SWAP = {
  paddingLeft: 'paddingRight', paddingRight: 'paddingLeft',
  marginLeft: 'marginRight', marginRight: 'marginLeft',
  borderLeft: 'borderRight', borderRight: 'borderLeft',
  borderLeftWidth: 'borderRightWidth', borderRightWidth: 'borderLeftWidth',
  borderLeftColor: 'borderRightColor', borderRightColor: 'borderLeftColor',
  borderLeftStyle: 'borderRightStyle', borderRightStyle: 'borderLeftStyle',
  borderTopLeftRadius: 'borderTopRightRadius', borderTopRightRadius: 'borderTopLeftRadius',
  borderBottomLeftRadius: 'borderBottomRightRadius', borderBottomRightRadius: 'borderBottomLeftRadius',
  left: 'right', right: 'left',
}
const FLIP_ROW = { row: 'row-reverse', 'row-reverse': 'row' }
const FLIP_ALIGN = { left: 'right', right: 'left' }
const FLIP_FLEX = { 'flex-start': 'flex-end', 'flex-end': 'flex-start' }

function flatten(style, out = {}) {
  if (!style) return out
  if (Array.isArray(style)) { for (const s of style) flatten(s, out); return out }
  return Object.assign(out, style)
}

export function mirror(style, { text = false } = {}) {
  const s = flatten(style)
  const out = {}
  for (const [k, v] of Object.entries(s)) {
    if (k === 'letterSpacing') continue
    out[SWAP[k] ?? k] = v
  }
  if (out.flexDirection && FLIP_ROW[out.flexDirection]) out.flexDirection = FLIP_ROW[out.flexDirection]
  if (out.textAlign && FLIP_ALIGN[out.textAlign]) out.textAlign = FLIP_ALIGN[out.textAlign]
  // In a column the cross axis is horizontal: "start" is the right edge in RTL.
  const isColumn = !out.flexDirection || out.flexDirection.startsWith('column')
  if (isColumn && out.alignItems && FLIP_FLEX[out.alignItems]) out.alignItems = FLIP_FLEX[out.alignItems]
  if (text) out.direction = 'rtl'
  return out
}

/* react-pdf right-aligns an RTL Text against its container rather than its
 * own box, so a Text that sizes to its content (in a row, or in a column that
 * aligns items to an edge) is drawn at the container's far edge, on top of its
 * neighbours. Such Text is marked by its parent View and drawn with left
 * alignment inside its (content-width) box, which lands it where it belongs. */
// Children are sized by their content (not stretched) in a row, or in a
// column that aligns its items to one edge.
const sizesToContent = (style) => {
  const f = flatten(style)
  return /^row/.test(f.flexDirection ?? '') || (f.alignItems && f.alignItems !== 'stretch') ||
    (f.alignSelf && f.alignSelf !== 'stretch')
}
const markContentSized = (children) => Children.map(children, (c) =>
  !isValidElement(c) ? c
    : c.type === Fragment ? markContentSized(c.props.children)
    : c.type === Text ? cloneElement(c, { inRow: true })
    : c)

/* Inside unbreakable blocks (wrap={false}: table rows, cards) react-pdf
 * mis-measures RTL-direction text when it moves the block to the next page —
 * whole tables were squeezed into a strip at the foot of the page. Text there
 * keeps the default direction and is only right-aligned; the row itself is
 * still mirrored. Paragraphs outside such blocks get full RTL. */

export function View({ style, children, render, unbreakable, ...props }) {
  // Pass `render` only when given: react-pdf treats a present-but-undefined
  // render prop as a dynamic node and tries to call it.
  if (!isRtl()) return <PdfView {...props} {...(render ? { render } : {})} style={style}>{children}</PdfView>
  const mark = sizesToContent(style)
  let kids = mark ? markContentSized(children) : children
  // Hand the "unbreakable" flag down through our own View/Text elements.
  const noBreak = unbreakable || props.wrap === false
  if (noBreak) kids = Children.map(kids, (c) => (isValidElement(c) && (c.type === View || c.type === Text) ? cloneElement(c, { unbreakable: true }) : c))
  // Fixed headers/footers draw through render(): mark what it returns too.
  const r = render && mark ? (args) => markContentSized(render(args)) : render
  return <PdfView {...props} {...(r ? { render: r } : {})} style={mirror(style)}>{kids}</PdfView>
}

/* Plain string children go through tx() as they are drawn, so labels held in
 * arrays and maps (['Prepared for', …], column headers) are translated without
 * each template wrapping them. Unknown strings — names, titles, ids — come
 * back unchanged. */
const translateChildren = (children) =>
  typeof children === 'string' ? tx(children)
    : Array.isArray(children) ? Children.map(children, (c) => (typeof c === 'string' ? tx(c) : c))
    : children

// A Text that names its own font gets the Arabic face as fallback too (the
// page's default family already carries it).
const withArabicFallback = (style) => {
  const f = flatten(style)
  return typeof f.fontFamily === 'string' && f.fontFamily !== FONT_ARABIC
    ? { ...f, fontFamily: [f.fontFamily, FONT_ARABIC] } : style
}

export function Text({ style, children, inRow, unbreakable, ...props }) {
  const rtl = isRtl()
  let st = withArabicFallback(style)
  if (rtl) {
    const flat = flatten(st)
    const sized = flat.width != null || flat.maxWidth != null || Number(flat.flex) > 0 || Number(flat.flexGrow) > 0
    // Short labels (headings, pills, cell values) don't need an RTL paragraph
    // direction and are where react-pdf's page-break measuring went wrong, so
    // only longer running text gets it.
    const kidsText = [].concat(translateChildren(children) ?? []).filter((c) => typeof c === 'string' || typeof c === 'number').join('')
    const paragraph = kidsText.length >= 40
    st = mirror(st, { text: !unbreakable && paragraph })
    if ((unbreakable || !paragraph) && !st.textAlign && !(inRow && !sized)) st.textAlign = 'right'
    // A content-sized box is exactly as wide as its text; drawing it with the
    // default RTL right alignment offsets the glyphs by the container width.
    if (inRow && !sized && !flatten(style).textAlign) st.textAlign = 'left'
  }
  return (
    <PdfText {...props} style={st}>
      {rtl ? translateChildren(children) : children}
    </PdfText>
  )
}
