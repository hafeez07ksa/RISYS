// Kept for backward compatibility; the list view now lives in ConnectorFindingsListPage.
import { ConnectorFindingsListPage } from './ConnectorFindingsListPage'

export function M365FindingsPlatformPage() {
  return <ConnectorFindingsListPage connectorId="m365" />
}
