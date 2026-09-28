/* ── Interface language ──────────────────────────────────────────────────────
 *
 * English is the source language and the fallback. Keys are the English
 * strings themselves ("natural-language keys"), so a string that has no Arabic
 * entry yet simply shows in English instead of showing a key like
 * `risks.form.title`. `src/locales/ar.json` maps English → Arabic.
 *
 * Why a global `tx()` instead of the `useTranslation()` hook: labels live in
 * module-level constants, helpers and table column definitions as well as in
 * components, and a hook can only run inside a component. Switching language
 * therefore reloads the page (setLanguage below), so every module evaluates
 * again in the new language. Changing language is rare; a reload is the
 * honest price for one code path everywhere.
 *
 * Terminology follows the NCA's official Arabic text of ECC-2:2024 (ضابط،
 * الأمن السيبراني، صاحب الصلاحية، الالتزام، الأطراف الخارجية …). Add new
 * strings to ar.json using the same vocabulary — see src/locales/README.md.
 *
 * This file must be imported before anything that calls tx() at module
 * level; main.jsx imports it first.
 * -------------------------------------------------------------------------- */
import i18n from 'i18next'
import ar from '@/locales/ar.json'

const STORAGE_KEY = 'risys.lang'

export const LANGUAGES = {
  en: { dir: 'ltr', label: 'English', nativeLabel: 'English' },
  ar: { dir: 'rtl', label: 'Arabic', nativeLabel: 'العربية' },
}

function storedLanguage() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && LANGUAGES[v]) return v
  } catch { /* storage unavailable: private mode, disabled cookies */ }
  return 'en'
}

i18n.init({
  resources: { en: { translation: {} }, ar: { translation: ar } },
  lng: storedLanguage(),
  fallbackLng: 'en',
  keySeparator: false,          // keys are sentences; '.' is not a path
  nsSeparator: false,           // ':' is not a namespace separator either
  interpolation: { escapeValue: false }, // React escapes
  returnEmptyString: false,
  initImmediate: false,         // resources are bundled: initialise synchronously
})

export const language = () => i18n.language
export const isRtl = () => LANGUAGES[i18n.language]?.dir === 'rtl'

/* Translate an English string. Non-strings and empty values pass through, so
 * it is safe to wrap a value that is sometimes a number, null or an element. */
export function tx(s, opts) {
  if (typeof s !== 'string' || !s) return s
  return i18n.t(s, { defaultValue: s, ...opts })
}

/* Locale for Intl / toLocale*String. Arabic uses Western digits and the
 * Gregorian calendar explicitly: plain 'ar-SA' defaults to Arabic-Indic digits
 * and the Umm al-Qura (Hijri) calendar, which would silently change every date
 * and number in the product. */
export function appLocale() {
  return i18n.language === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB'
}

function applyToDocument(lng) {
  // Node has no DOM: tools/gate-check.mjs runs the gate engine, which imports
  // tx() from here, with no browser present.
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.lang = lng
  el.dir = LANGUAGES[lng]?.dir || 'ltr'
}
applyToDocument(i18n.language)

export function setLanguage(lng) {
  if (!LANGUAGES[lng] || lng === i18n.language) return
  try { localStorage.setItem(STORAGE_KEY, lng) } catch { /* ignore */ }
  window.location.reload()
}

/* Pick the Arabic column of a bilingual row when the interface is Arabic,
 * e.g. localized(row, 'control_text') → row.control_text_ar ?? row.control_text.
 * Regulatory text is shown in the regulator's own Arabic, never machine
 * translated; if the Arabic column is empty the English is shown. */
export function localized(row, field) {
  if (!row) return null
  if (i18n.language === 'ar') {
    const v = row[`${field}_ar`]
    if (v) return v
  }
  return row[field]
}

/* Whole-row version for regulator tables that carry *_ar columns (nca_ecc
 * after the 2026-09-21 Arabic migration): in Arabic, every field `x` with a
 * non-empty `x_ar` is replaced by it, so pages keep reading `control_text`,
 * `subdomain_name` … and get the NCA's Arabic wording without knowing about
 * it. Rows without *_ar columns pass through untouched. */
export function localizeRow(row) {
  if (!row || i18n.language !== 'ar') return row
  let out = null
  for (const k of Object.keys(row)) {
    if (k.endsWith('_ar') && row[k]) {
      out = out || { ...row }
      out[k.slice(0, -3)] = row[k]
    }
  }
  return out || row
}

export default i18n
