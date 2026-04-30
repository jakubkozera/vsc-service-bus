import React, { useMemo, useCallback } from 'react';
import styles from './DurationInput.module.css';

export interface DurationInputProps {
  label?: string;
  value: string; // ISO 8601 duration string (e.g., "PT1M", "P1DT2H3M4S")
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}

interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Parse ISO 8601 duration string to days, hours, minutes, seconds
 * Examples: "PT1M" → {0,0,1,0}, "P1DT2H30M" → {1,2,30,0}, "PT30S" → {0,0,0,30}, "P14D" → {14,0,0,0}
 */
function parseISO8601Duration(iso: string): DurationParts {
  const parts: DurationParts = { days: 0, hours: 0, minutes: 0, seconds: 0 };
  if (!iso || !iso.startsWith('P')) return parts;

  // Handle the special "never expires" value
  if (iso === 'P10675199DT2H48M5.4775807S') {
    return parts; // Show as all zeros for "never"
  }

  // Remove P prefix
  let remaining = iso.substring(1);
  
  // Extract days (before T)
  const daysMatch = remaining.match(/^(\d+)D/);
  if (daysMatch) {
    parts.days = parseInt(daysMatch[1], 10);
    remaining = remaining.substring(daysMatch[0].length);
  }
  
  // If there's a T, parse time components
  if (remaining.startsWith('T')) {
    remaining = remaining.substring(1);
    
    const hoursMatch = remaining.match(/^(\d+)H/);
    if (hoursMatch) {
      parts.hours = parseInt(hoursMatch[1], 10);
      remaining = remaining.substring(hoursMatch[0].length);
    }
    
    const minutesMatch = remaining.match(/^(\d+)M/);
    if (minutesMatch) {
      parts.minutes = parseInt(minutesMatch[1], 10);
      remaining = remaining.substring(minutesMatch[0].length);
    }
    
    const secondsMatch = remaining.match(/^(\d+(?:\.\d+)?)S/);
    if (secondsMatch) {
      parts.seconds = parseInt(secondsMatch[1], 10);
    }
  }
  
  return parts;
}

/**
 * Convert days, hours, minutes, seconds to ISO 8601 duration string
 * Examples: {0,0,1,0} → "PT1M", {1,2,30,0} → "P1DT2H30M", {0,0,0,30} → "PT30S"
 */
function toISO8601Duration(parts: DurationParts): string {
  const { days, hours, minutes, seconds } = parts;
  
  // If all zeros, return a default value
  if (days === 0 && hours === 0 && minutes === 0 && seconds === 0) {
    return 'PT0S';
  }

  let result = 'P';
  
  if (days > 0) {
    result += `${days}D`;
  }
  
  const hasTimePart = hours > 0 || minutes > 0 || seconds > 0;
  if (hasTimePart) {
    result += 'T';
    if (hours > 0) result += `${hours}H`;
    if (minutes > 0) result += `${minutes}M`;
    if (seconds > 0) result += `${seconds}S`;
  }
  
  return result;
}

export const DurationInput: React.FC<DurationInputProps> = ({
  label,
  value,
  onChange,
  disabled = false,
  required = false,
}) => {
  const parts = useMemo(() => parseISO8601Duration(value), [value]);

  const updatePart = useCallback(
    (field: keyof DurationParts, newValue: number) => {
      const updated = { ...parts, [field]: Math.max(0, newValue) };
      onChange(toISO8601Duration(updated));
    },
    [parts, onChange]
  );

  const handleChange = (field: keyof DurationParts) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const numValue = parseInt(e.target.value || '0', 10);
    updatePart(field, isNaN(numValue) ? 0 : numValue);
  };

  const increment = (field: keyof DurationParts) => () => {
    if (!disabled) {
      updatePart(field, parts[field] + 1);
    }
  };

  const decrement = (field: keyof DurationParts) => () => {
    if (!disabled) {
      updatePart(field, Math.max(0, parts[field] - 1));
    }
  };

  const renderInputGroup = (field: keyof DurationParts, label: string, max?: number) => (
    <div className={styles.inputGroup}>
      <div className={styles.inputWrapper}>
        <input
          type="number"
          min="0"
          max={max}
          value={parts[field]}
          onChange={handleChange(field)}
          disabled={disabled}
          className={styles.input}
        />
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.controlButton}
            onClick={increment(field)}
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
            onClick={decrement(field)}
            disabled={disabled}
            tabIndex={-1}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6l6-6" />
            </svg>
          </button>
        </div>
      </div>
      <span className={styles.unit}>{label}</span>
    </div>
  );

  return (
    <div className={styles.container}>
      {label && (
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      <div className={styles.inputs}>
        {renderInputGroup('days', 'days')}
        {renderInputGroup('hours', 'hours', 23)}
        {renderInputGroup('minutes', 'min', 59)}
        {renderInputGroup('seconds', 'sec', 59)}
      </div>
    </div>
  );
};
