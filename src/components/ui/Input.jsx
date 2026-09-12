import clsx from 'clsx'

/* Input keeps its own markup — a text field has no reason to be anything but
 * a native <input>. Only the label and error treatment changed, to the shared
 * field tokens so a label here matches a label on a Combobox. */
export function Input({ label, error, help, required, className, ...props }) {
  return (
    <div className="flex flex-col">
      {label && (
        <label className="field-label">
          {label}{required && <span className="field-req">*</span>}
        </label>
      )}
      <input
        className={clsx('risys-input', className)}
        aria-invalid={error ? 'true' : undefined}
        {...props}
      />
      {help && !error && <p className="field-help">{help}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

/* Select is no longer a native <select>. It forwards to SelectField, which is
 * the Combobox underneath, so the two remaining call sites that import Select
 * from here get the same control as everywhere else without being edited.
 * The <option> children they pass are read by SelectField. */
export { SelectField as Select } from './Combobox'
