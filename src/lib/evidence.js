import { supabase } from '@/lib/supabase'

export const RISK_EVIDENCE_BUCKET = 'risk-evidence'
const SIGNED_URL_TTL_SECONDS = 60

// V1: evidence files live in a private bucket. Links are short-lived signed URLs
// generated on click, so nothing shareable or permanent is ever stored.
export async function getEvidenceSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from(RISK_EVIDENCE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) throw new Error(`Could not open the file: ${error.message}`)
  return data.signedUrl
}

export async function openEvidenceFile(evidence) {
  if (!evidence?.file_path) throw new Error('This evidence has no file attached.')
  // Open the tab synchronously (inside the click) so popup blockers allow it,
  // then point it at the signed URL once we have one.
  const win = window.open('', '_blank')
  try {
    const url = await getEvidenceSignedUrl(evidence.file_path)
    if (win) {
      win.opener = null
      win.location.href = url
    } else {
      window.location.assign(url)
    }
  } catch (err) {
    if (win) win.close()
    throw err
  }
}

export async function uploadEvidenceFile(orgId, folder, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${orgId}/${folder}/${Date.now()}_${safeName}`
  const { error } = await supabase.storage
    .from(RISK_EVIDENCE_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw new Error(`File upload failed: ${error.message}`)
  return { file_path: path, file_name: file.name, file_size: file.size }
}

// Deletes the evidence row, then its file. Storage cleanup is best-effort:
// the row is the source of truth and the file is unreachable without it.
export async function deleteEvidenceRecord(id) {
  const { data: row } = await supabase
    .from('risk_evidence')
    .select('file_path')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('risk_evidence').delete().eq('id', id)
  if (error) throw error

  if (row?.file_path) {
    await supabase.storage.from(RISK_EVIDENCE_BUCKET).remove([row.file_path]).catch(() => {})
  }
}
