import { useState } from 'react'
import clsx from 'clsx'
import { Eye, EyeOff } from 'lucide-react'
import { tx } from '@/lib/i18n'

/* A password field with a show/hide toggle.
 *
 * The toggle is a real <button type="button"> so it never submits the form,
 * is reachable by keyboard, and announces its state to screen readers. It sits
 * at the inline end, so it moves to the left in Arabic.
 *
 * Use it bare (no label) inside pages that draw their own label, or through
 * <Input type="password">, which routes here automatically. */
export function PasswordInput({ className, wrapperClassName, style, ...props }) {
  const [shown, setShown] = useState(false)
  return (
    <div className={clsx('pw-wrap', wrapperClassName)}>
      <input
        {...props}
        type={shown ? 'text' : 'password'}
        className={clsx('risys-input', 'pw-input', className)}
        style={style}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShown(s => !s)}
        aria-label={shown ? tx('Hide password') : tx('Show password')}
        aria-pressed={shown}
        title={shown ? tx('Hide password') : tx('Show password')}
        tabIndex={0}
      >
        {shown ? <EyeOff size={15} strokeWidth={1.8} /> : <Eye size={15} strokeWidth={1.8} />}
      </button>
    </div>
  )
}
