// ============================================================
// ACCEPTANCE AUTHORITY — who may accept a risk
//
// Acceptance is a formal, time-bound decision to retain residual risk,
// and whoever signs it must hold authority that matches the score. The
// authority ladder follows the band:
//
//   Low      → the risk owner
//   Medium   → the CISO
//   High     → the Steering Committee
//   Critical → the Board
//
// Outside tolerance an acceptance is no longer an acceptance — it is an
// EXCEPTION, and it needs at least the Steering Committee whatever the
// band, alongside compensating controls and a hard expiry. So Accept is
// never simply "blocked": the gate names who can sign.
//
// Pure functions only, so the ladder is testable under plain Node
// (tools/gate-check.mjs) and can move into Postgres with the rest of the
// gate without its rules changing.
// ============================================================

export const AUTHORITY_TIERS = [
  { value: 'risk_owner', label: 'Risk owner',         rank: 0, desc: 'The accountable owner of the risk. Needs no assignment.' },
  { value: 'ciso',       label: 'CISO',               rank: 1, desc: 'Chief Information Security Officer, or the delegated head of security.' },
  { value: 'committee',  label: 'Steering Committee', rank: 2, desc: 'The cybersecurity or enterprise risk steering committee.' },
  { value: 'board',      label: 'Board',              rank: 3, desc: 'The board of directors or its risk committee.' },
]

/** The authority each band needs for an acceptance within tolerance. */
export const BAND_AUTHORITY = { low: 'risk_owner', medium: 'ciso', high: 'committee', critical: 'board' }

/** The lowest authority that may sign an exception above tolerance. */
export const EXCEPTION_FLOOR = 'committee'

const RANK = Object.fromEntries(AUTHORITY_TIERS.map(t => [t.value, t.rank]))

export function tierRank(tier) {
  return RANK[tier] ?? -1
}

export function tierMeta(tier) {
  return AUTHORITY_TIERS.find(t => t.value === tier) || { value: tier, label: tier || '—', rank: -1, desc: '' }
}

export function maxTier(a, b) {
  return tierRank(a) >= tierRank(b) ? a : b
}

/**
 * The authority an acceptance needs. `withinTolerance` is the gate's
 * verdict: true, false, or undefined when the gate has not judged yet (in
 * which case only the band applies).
 */
export function requiredAuthority({ band, withinTolerance }) {
  const base = BAND_AUTHORITY[band] || 'risk_owner'
  return withinTolerance === false ? maxTier(base, EXCEPTION_FLOOR) : base
}

export function acceptanceType(withinTolerance) {
  return withinTolerance === false ? 'exception' : 'acceptance'
}

/**
 * The highest tier a user can act under for this risk. Owning the risk
 * confers the risk-owner tier; everything above it has to be assigned.
 */
export function highestTierFor({ userId, risk, holders = [] }) {
  if (!userId) return null
  let best = risk?.owner_id && risk.owner_id === userId ? 'risk_owner' : null
  for (const h of holders) {
    if (h.user_id === userId) best = best ? maxTier(best, h.tier) : h.tier
  }
  return best
}

/** Members who may sign at `required` or above — the approver picklist. */
export function eligibleApprovers({ required, risk, holders = [], members = [] }) {
  const ids = new Set()
  if (required === 'risk_owner' && risk?.owner_id) ids.add(risk.owner_id)
  holders.filter(h => tierRank(h.tier) >= tierRank(required)).forEach(h => ids.add(h.user_id))
  return members.filter(m => ids.has(m.user_id))
}

/**
 * Whether a user may approve. Two rules:
 *
 *   1. Their authority must reach the required tier.
 *   2. Independence — nobody approves a request they raised, except a
 *      risk owner accepting a risk inside their own authority, which is
 *      exactly the decision the ladder gives them.
 */
export function canApprove({ userId, risk, holders = [], required, requestedBy }) {
  if (!userId) return { allowed: false, reason: 'Sign in to decide.', held: null }
  const held = highestTierFor({ userId, risk, holders })
  if (tierRank(held) < tierRank(required)) {
    return {
      allowed: false,
      held,
      reason: `Needs ${tierMeta(required).label} authority${held ? ` — you hold ${tierMeta(held).label}` : ''}.`,
    }
  }
  const selfApprovalAllowed = required === 'risk_owner' && risk?.owner_id === userId
  if (requestedBy && requestedBy === userId && !selfApprovalAllowed) {
    return { allowed: false, held, reason: 'You raised this request, so someone else with the authority has to approve it.' }
  }
  return { allowed: true, held, reason: null }
}
