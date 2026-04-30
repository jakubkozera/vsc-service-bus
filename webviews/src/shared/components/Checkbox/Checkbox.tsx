/**
 * Checkbox Component - VS Code styled checkbox with label
 */
import React from 'react';
import styles from './Checkbox.module.css';

export interface CheckboxProps {
  /** Whether the checkbox is checked */
  checked: boolean;
  /** Callback fired when the checkbox is toggled */
  onChange: (checked: boolean) => void;
  /** Disable the checkbox */
  disabled?: boolean;
  /** Optional visible label rendered next to the checkbox */
  label?: string;
  /** HTML id applied to the input */
  id?: string;
  /** Additional CSS class for the wrapper */
  className?: string;
  /** Children rendered as label content (alternative to label prop) */
  children?: React.ReactNode;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  id,
  className,
  children,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <label className={`${styles.wrapper} ${disabled ? styles.disabled : ''} ${className || ''}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        className={styles.input}
      />
      {(label || children) && (
        <span className={styles.label}>{children || label}</span>
      )}
    </label>
  );
};
