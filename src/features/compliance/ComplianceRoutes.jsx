import { useParams, useNavigate } from 'react-router-dom'
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
  const fw = decodeURIComponent(frameworkId)

  return (
    <ComplianceFrameworkPage
      frameworkId={fw}
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
