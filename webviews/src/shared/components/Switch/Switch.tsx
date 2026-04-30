/**
 * Switch Component - VS Code styled toggle switch
 */
import React from 'react';
import styles from './Switch.module.css';

export interface SwitchProps {
  /** Whether the switch is on */
  checked: boolean;
  /** Callback fired when the switch is toggled */
  onChange: (checked: boolean) => void;
  /** Disable the switch */
  disabled?: boolean;
  /** Optional visible label rendered next to the switch */
  label?: string;
  /** HTML id applied to the input */
  id?: string;
  /** Additional CSS class for the wrapper */
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  id,
  className,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <div className={`${styles.wrapper} ${className || ''}`}>
      <label className={`${styles.switch} ${disabled ? styles.disabled : ''}`}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className={styles.input}
        />
        <span className={styles.slider}></span>
      </label>
      {label && (
        <span className={styles.label}>{label}</span>
      )}
    </div>
  );
};
