import { useState } from 'react'
import { Library, ChevronRight, Lock, CheckCircle2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import {
  PRIMARY_FRAMEWORKS,
  SECONDARY_FRAMEWORKS,
  useFrameworkRequirements,
} from '@/hooks/useCompliance'
import { FrameworkReaderPage } from './FrameworkReaderPage'

/*
 * Frameworks library.
 *
 * Only NCA ECC is in active scope — it lives under Compliance and is the only
 * framework that is scored, mapped or reported on. Everything else sits here:
 * the control text is loaded and browsable so the content is verifiable before
 * a framework is brought into scope, but nothing is assessed against it.
 *
 * To promote a framework, move its id into PRIMARY_FRAMEWORK_ID handling in
 * hooks/useCompliance.js. Nothing else needs to change.
 */

// ── One row in the library ────────────────────────────────────────────────────
function FrameworkRow({ fw, active, onOpen }) {
  const { requirements, loading } = useFrameworkRequirements(fw.id)
  const mainCount = requirements.filter(r => r.control_type !== 'Sub-Control').length

  return (
    <button
      onClick={() => onOpen(fw.id)}
      className="card"
      style={{
        padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%',
        display: 'flex', alignItems: 'stretch',
        transition: 'box-shadow 0.15s, transform 0.15s',
        opacity: active ? 1 : 0.92,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(26,19,20,0.10)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
    >
      <div style={{ width: 4, background: fw.color, borderRadius: '12px 0 0 12px', flexShrink: 0 }} />

      <div style={{ flex: 1, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{fw.label}</span>
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
              color: fw.color, background: fw.bg, border: `1px solid ${fw.color}22`,
            }}>{fw.tag}</span>
            {active ? (
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
                color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0',
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                <CheckCircle2 size={10} /> In scope
              </span>
            ) : (
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 500,
                color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)',
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                <Lock size={10} /> Not assessed
              </span>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.4 }}>{fw.fullName}</p>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p className="tnum" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
            {loading ? '—' : mainCount}
          </p>
          <p style={{ fontSize: 10.5, color: 'var(--text-3)' }}>requirements</p>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 76 }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{fw.version}</p>
        </div>

        <ChevronRight size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </div>
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function FrameworksPage() {
  const { organization } = useAuth()
  const [openFramework, setOpenFramework] = useState(null)

  // Always the reader. Frameworks is a reference library — opening a framework
  // here shows the regulation as published, never the entity's assessment of it.
  // Assessment for the in-scope framework lives under Compliance.
  if (openFramework) {
    return (
      <FrameworkReaderPage
        frameworkId={openFramework}
        onBack={() => setOpenFramework(null)}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title="Frameworks" subtitle={organization?.name} />

      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>

        <div style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            Framework library
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 660, lineHeight: 1.55 }}>
            Every Saudi regulatory framework loaded into RISYS. Control text is browsable
            here for reference. Only frameworks marked in scope are scored, mapped to
            controls, or included in reporting.
          </p>
        </div>

        {/* Active */}
        <p style={{
          fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em',
          color: 'var(--text-3)', fontWeight: 600, marginBottom: 10,
        }}>
          In scope
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          {PRIMARY_FRAMEWORKS.map(fw => (
            <FrameworkRow key={fw.id} fw={fw} active onOpen={setOpenFramework} />
          ))}
        </div>

        {/* Library */}
        <p style={{
          fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em',
          color: 'var(--text-3)', fontWeight: 600, marginBottom: 10,
        }}>
          Available — not currently assessed
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SECONDARY_FRAMEWORKS.map(fw => (
            <FrameworkRow key={fw.id} fw={fw} active={false} onOpen={setOpenFramework} />
          ))}
        </div>

        <div style={{
          marginTop: 24, padding: '12px 16px', borderRadius: 10,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <Library size={14} style={{ color: 'var(--text-3)', marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55 }}>
            Opening a framework here shows the published control text as issued — no
            scoring, no control mapping, no interpretation. Assessment happens under
            Compliance, and only for the framework in scope.
          </p>
        </div>
      </div>
    </div>
  )
}
