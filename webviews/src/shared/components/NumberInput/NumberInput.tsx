import React from 'react';
import styles from './NumberInput.module.css';

export interface NumberInputProps {
  label?: string;
  value: number | string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  helperText?: string;
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  style?: React.CSSProperties;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  disabled = false,
  helperText,
  required = false,
  min,
  max,
  placeholder,
  style,
}) => {
  const numValue = typeof value === 'string' ? parseInt(value, 10) || 0 : value;

  const increment = () => {
    if (!disabled) {
      const newValue = max !== undefined ? Math.min(numValue + 1, max) : numValue + 1;
      const event = {
        target: { value: String(newValue) },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange(event);
    }
  };

  const decrement = () => {
    if (!disabled) {
      const newValue = min !== undefined ? Math.max(numValue - 1, min) : numValue - 1;
      const event = {
        target: { value: String(newValue) },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange(event);
    }
  };

  return (
    <div className={styles.container} style={style}>
      {label && (
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      <div className={styles.inputWrapper}>
        <input
          type="number"
          value={value}
          onChange={onChange}
          disabled={disabled}
          min={min}
          max={max}
          placeholder={placeholder}
          className={styles.input}
        />
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.controlButton}
            onClick={increment}
            disabled={disabled}
            tabIndex={-1}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 15l-6-6l-6 6" />
            </svg>
          </button>
          <button
            type="button"
            className={styles.controlButton}
            onClick={decrement}
            disabled={disabled}
            tabIndex={-1}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6l6-6" />
            </svg>
          </button>
        </div>
      </div>
      {helperText && <div className={styles.helperText}>{helperText}</div>}
    </div>
  );
};
