/* ── Report theme ─────────────────────────────────────────────────────────────
 *
 * The RISYS palette for printed reports, lifted from src/styles/tokens.css so a
 * board pack reads as the same product as the app. PDF renderers cannot read
 * CSS custom properties, so the values are repeated here — if a token changes
 * in tokens.css, change it here too.
 * -------------------------------------------------------------------------- */

export const C = {
  ink:         '#251518',   // --brand-ink   cover band
  wine:        '#4C0C25',   // --brand-wine  display headings
  cream:       '#F8F4EA',   // --brand-cream text on ink
  crimson:     '#5D0F0F',   // --crimson     primary accent
  crimsonWash: '#FBEAEA',   // --crimson-wash
  rose:        '#895353',   // --rose        eyebrows, secondary accent
  taupe:       '#A98D8C',
  blush:       '#E9D8D5',
  bg:          '#FBF7F6',
  surface:     '#F6EEEC',   // table heads, tiles
  surface2:    '#EFE3E0',
  hover:       '#FAF3F1',   // zebra rows
  text:        '#292021',
  text2:       '#4D3E3E',
  text3:       '#97817D',
  border:      '#E9DAD7',
  border3:     '#F0ECEC',
  white:       '#FFFFFF',
}

/* Risk bands — identical to BAND_META in lib/matrix.js. */
export const BAND = {
  critical: { label: 'Critical', color: '#8C1616', bg: '#FBEAEA', border: '#F0CECE' },
  high:     { label: 'High',     color: '#B5491B', bg: '#FBEFE7', border: '#F0D4C2' },
  medium:   { label: 'Medium',   color: '#9C6F0F', bg: '#FAF3E2', border: '#EBDCB6' },
  low:      { label: 'Low',      color: '#2F6B3C', bg: '#ECF4EE', border: '#C8DECD' },
  none:     { label: 'Not scored', color: '#97817D', bg: '#F6EEEC', border: '#E9DAD7' },
}

/* Compliance statuses as the app records them. */
export const COMPLIANCE = {
  compliant:      { label: 'Compliant',      color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  partial:        { label: 'Partial',        color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  in_progress:    { label: 'In progress',    color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  not_compliant:  { label: 'Not compliant',  color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  not_applicable: { label: 'N/A',            color: '#6B5A5A', bg: '#F6EEEC', border: '#E9DAD7' },
  not_started:    { label: 'Not assessed',   color: '#97817D', bg: '#FFFFFF', border: '#E9DAD7' },
}

/* Automated status from v_requirement_automation. */
export const AUTOMATED = {
  compliant:      { label: 'Pass',        color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  partial:        { label: 'Partial',     color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  not_compliant:  { label: 'Fail',        color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  not_started:    { label: 'Not measured',color: '#97817D', bg: '#FFFFFF', border: '#E9DAD7' },
  not_applicable: { label: 'N/A',         color: '#6B5A5A', bg: '#F6EEEC', border: '#E9DAD7' },
}

export const SIGNAL = {
  pass:           { label: 'Pass',    color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  partial:        { label: 'Partial', color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  fail:           { label: 'Fail',    color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  unknown:        { label: 'Unknown', color: '#97817D', bg: '#FFFFFF', border: '#E9DAD7' },
  not_applicable: { label: 'N/A',     color: '#6B5A5A', bg: '#F6EEEC', border: '#E9DAD7' },
}

export const TEST_RESULT = {
  effective:           { label: 'Effective',           color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  partially_effective: { label: 'Partially effective', color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  ineffective:         { label: 'Ineffective',         color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  not_applicable:      { label: 'N/A',                 color: '#6B5A5A', bg: '#F6EEEC', border: '#E9DAD7' },
  not_tested:          { label: 'Not tested',          color: '#97817D', bg: '#FFFFFF', border: '#E9DAD7' },
}

export const FINDING_RATING = {
  high:        { label: 'High',        color: '#8C1616', bg: '#FBEAEA', border: '#F0CECE' },
  medium:      { label: 'Medium',      color: '#9C6F0F', bg: '#FAF3E2', border: '#EBDCB6' },
  low:         { label: 'Low',         color: '#2F6B3C', bg: '#ECF4EE', border: '#C8DECD' },
  observation: { label: 'Observation', color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
}

export const FINDING_STATUS = {
  draft:                { label: 'Draft' },
  open:                 { label: 'Open' },
  in_remediation:       { label: 'In remediation' },
  ready_for_validation: { label: 'Awaiting validation' },
  closed:               { label: 'Closed' },
  risk_accepted:        { label: 'Risk accepted' },
}

export const OPINION = {
  effective:           { label: 'Effective',           color: '#166534', bg: '#F0FDF4', border: '#BBF7D0',
                         text: 'The controls tested are designed appropriately and operated effectively throughout the period.' },
  partially_effective: { label: 'Partially effective', color: '#92400E', bg: '#FFFBEB', border: '#FDE68A',
                         text: 'The controls tested are largely in place, but the weaknesses reported need management action to fully meet the requirement.' },
  ineffective:         { label: 'Ineffective',         color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA',
                         text: 'Significant weaknesses were found. The controls tested cannot be relied on until the findings reported are remediated.' },
}

export const SEVERITY = {
  critical: { label: 'Critical', color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  high:     { label: 'High',     color: '#C0392B', bg: '#FEF3F0', border: '#FBD5CC' },
  warning:  { label: 'Warning',  color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  medium:   { label: 'Medium',   color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  low:      { label: 'Low',      color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  info:     { label: 'Info',     color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  informational: { label: 'Info', color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
}

export const REPORT_TYPES = {
  board_pack:   { label: 'Board risk & compliance report', short: 'Board pack',
                  audience: 'Board of Directors', classification: 'Confidential — Board' },
  ecc_status:   { label: 'NCA ECC compliance status report', short: 'ECC status',
                  audience: 'Regulator and management', classification: 'Confidential' },
  audit_report: { label: 'Audit report', short: 'Audit report',
                  audience: 'Audit committee and management', classification: 'Confidential — Audit' },
}
