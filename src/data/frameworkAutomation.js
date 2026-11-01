import { automationClassFor as eccClassFor, mainControlId as eccMainId } from './eccAutomation.js'
import { cccAutomationClassFor, cccMainId } from './cccAutomation.js'
import { evidenceRequirementFor as eccEvidenceFor } from './eccEvidenceRequirements.js'
import { cccEvidenceRequirementFor } from './cccEvidenceRequirements.js'

// ============================================================
// FRAMEWORK-AWARE LOOKUPS
//
// The implemented frameworks (NCA ECC, NCA CCC) share one model: each main
// control carries an automation class, evidence is recorded once on the main
// control, and subcontrols follow it. These helpers pick the right catalogue
// so pages never branch on the framework id themselves.
// ============================================================

export const CLASSIFIED_FRAMEWORKS = ['NCA ECC', 'NCA CCC']

export const hasAutomationClasses = (frameworkId) => CLASSIFIED_FRAMEWORKS.includes(frameworkId)

export function automationClassForFramework(frameworkId, id) {
  if (frameworkId === 'NCA ECC') return eccClassFor(id)
  if (frameworkId === 'NCA CCC') return cccAutomationClassFor(id)
  return null
}

export function mainIdForFramework(frameworkId, id) {
  if (frameworkId === 'NCA CCC') return cccMainId(id)
  if (frameworkId === 'NCA ECC') return eccMainId(id)
  return id
}

/** { mode, def } for a main control's Comply form, or null. */
export function evidenceRequirementForFramework(frameworkId, id, { measured = false, level } = {}) {
  if (frameworkId === 'NCA ECC') return eccEvidenceFor(id, { measured })
  if (frameworkId === 'NCA CCC') return cccEvidenceRequirementFor(id, { measured, level: level ?? 3 })
  return null
}
