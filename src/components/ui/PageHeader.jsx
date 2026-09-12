import { Breadcrumb } from './Breadcrumb'

/* Page frame (§7). Every page gets the same skeleton in the same order:
 *
 *   breadcrumb → title + description → actions → metrics → filters → workspace
 *
 * Before this each page invented its own header, so the title sat at a
 * different height on Risks than on Controls and the eye had to re-find it on
 * every navigation. */
export function PageHeader({ breadcrumb, title, description, actions, meta, children }) {
  return (
    <div style={{ padding: 'var(--s-5) var(--gutter) 0' }}>
      {breadcrumb?.length > 0 && <div style={{ marginBottom: 10 }}><Breadcrumb items={breadcrumb} /></div>}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 'var(--t-page)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>
              {title}
            </h1>
            {meta}
          </div>
          {description && (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--text-3)', margin: '4px 0 0', maxWidth: 620, lineHeight: 1.55 }}>
              {description}
            </p>
          )}
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>{actions}</div>}
      </div>

      {children && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  )
}

export function PageBody({ children, style }) {
  return <div style={{ padding: '16px var(--gutter) var(--s-10)', ...style }}>{children}</div>
}
