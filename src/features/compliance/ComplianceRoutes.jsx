import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ComplianceFrameworkPage } from './ComplianceFrameworkPage'
import { ComplianceControlPage } from './ComplianceControlPage'

/*
 * Thin wrappers binding URL params to the compliance pages.
 *
 * Framework ids contain spaces ("NCA ECC"), so they are encoded in the path.
 * Keeping the pages themselves prop-driven means they can still be rendered
 * inside a drawer or a report preview without a router.
 */

export function ComplianceFrameworkRoute() {
  const { frameworkId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const fw = decodeURIComponent(frameworkId)

  // The evidence-type filter lives in the query string so a filtered view
  // survives a reload and can be shared as a link.
  const setEvidence = (value) => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (value) next.set('evidence', value)
    else next.delete('evidence')
    return next
  }, { replace: true })

  return (
    <ComplianceFrameworkPage
      frameworkId={fw}
      evidenceFilter={params.get('evidence') || ''}
      onEvidenceFilterChange={setEvidence}
      onBack={() => navigate('/app/compliance')}
      onOpenControl={(reqId) =>
        navigate(`/app/compliance/${encodeURIComponent(fw)}/${encodeURIComponent(reqId)}`)}
    />
  )
}

export function ComplianceControlRoute() {
  const { frameworkId, requirementId } = useParams()
  const navigate = useNavigate()
  const fw = decodeURIComponent(frameworkId)

  return (
    <ComplianceControlPage
      frameworkId={fw}
      requirementId={decodeURIComponent(requirementId)}
      onBack={() => navigate(`/app/compliance/${encodeURIComponent(fw)}`)}
      onOpenControl={(reqId) =>
        navigate(`/app/compliance/${encodeURIComponent(fw)}/${encodeURIComponent(reqId)}`)}
    />
  )
}
