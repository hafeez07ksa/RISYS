# Interface translations

`ar.json` maps **English → Arabic**. The English string *is* the key, so a
string with no Arabic entry simply shows in English — nothing breaks.

## Adding or changing UI text

1. In code, wrap display text in `tx()`:

   ```jsx
   import { tx } from '@/lib/i18n'
   <Button>{tx('Save changes')}</Button>
   <Input placeholder={tx('Search controls…')} />
   const STATUS = [{ value: 'open', label: tx('Open') }]   // labels, never values
   ```

   Wrap **labels only** — never a value that is stored, compared or sent to the
   database (`value`, `status`, `type`, ids).
2. Add the Arabic to `ar.json` (keep it sorted).
3. `npm run check:i18n` lists every wrapped string still missing Arabic.

Shared components already translate what they draw — `StatusBadge`
(`labelFor`), `Tabs`, `DataTable` headers, `Combobox` options, `Filters`,
`Breadcrumb`, the date picker — so a label passed to them only needs a
dictionary entry.

Dates and numbers: pass `appLocale()` to `toLocaleDateString` /
`Intl.*`. Arabic uses **Western digits and the Gregorian calendar**
(`ar-SA-u-nu-latn-ca-gregory`); plain `ar-SA` would switch to Arabic-Indic
digits and the Hijri calendar.

## Regulatory text is not translated here

Framework text comes from the regulator's own Arabic edition, stored in
`*_ar` columns (e.g. `nca_ecc.control_text_ar`) and picked up by
`localizeRow()`. Never machine-translate control text: where the NCA issues
both languages, the Arabic is binding.

## Terminology

Use the NCA's vocabulary from ECC-2:2024 so the product reads like the
regulation it implements.

| English | Arabic |
|---|---|
| Cybersecurity | الأمن السيبراني |
| Control / controls | ضابط / الضوابط |
| Subcontrol | ضابط فرعي |
| Main domain / subdomain | مكون أساسي / مكون فرعي |
| Objective | الهدف |
| Entity / organisation | الجهة |
| Authorizing official | صاحب الصلاحية |
| Compliance | الالتزام |
| Periodic assessment and audit | المراجعة والتدقيق الدوري |
| Finding (audit or connector) | ملاحظة / الملاحظات |
| Evidence | الأدلة |
| Asset | الأصل / الأصول المعلوماتية والتقنية |
| Identity and access management | إدارة هويات الدخول والصلاحيات |
| MFA | التحقق من الهوية متعدد العناصر |
| Privileged access | الصلاحيات الهامة والحساسة |
| Incident | حادثة |
| Threat intelligence | المعلومات الاستباقية |
| Vulnerability | الثغرة |
| Third party | طرف خارجي / الأطراف الخارجية |
| Staff | العاملون |
| Steering committee | اللجنة الإشرافية |

GRC terms ECC does not define:

| English | Arabic |
|---|---|
| Risk register | سجل المخاطر |
| Risk (one record) | خطر |
| Inherent / residual | الكامنة / المتبقية |
| Likelihood / impact | الاحتمالية / الأثر |
| Tolerance / appetite | حدود التحمّل / الرغبة في المخاطرة |
| Treatment — reduce / transfer / avoid / accept | المعالجة — التخفيف / النقل / التجنب / القبول |
| Key risk indicator | مؤشر مخاطر رئيسي |
| Audit engagement | مهمة تدقيق |
| Condition / criteria / cause / effect | الحالة / المعيار / السبب / الأثر |
| Opinion | الرأي |
| Connector | موصّل |
| Workspace | مساحة العمل |
| Owner / Admin / Risk manager / Compliance officer / Member / Auditor / Viewer | المالك / مسؤول النظام / مدير المخاطر / مسؤول الالتزام / عضو / مدقق / مُطّلع |

Product and platform names (Microsoft Entra ID, SharePoint, Jira, Secure
Score) stay in English.

Arrows: in Arabic, "forward" points left. Write `إنشاء الحساب ←` for
"Create account →" and `→ العودة` for "← Back".
