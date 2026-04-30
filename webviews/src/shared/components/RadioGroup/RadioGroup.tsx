import styles from './RadioGroup.module.css';

export interface RadioGroupOption<T extends string = string> {
    value: T;
    label: string;
}

export interface RadioGroupProps<T extends string = string> {
    /** Array of selectable options */
    options: RadioGroupOption<T>[];
    /** Currently selected value */
    value: T;
    /** Callback fired when selection changes */
    onChange: (value: T) => void;
    /** Optional visible label rendered above the group */
    label?: string;
    /** Disable the entire group */
    disabled?: boolean;
    /** Additional CSS class for the wrapper */
    className?: string;
    /** Accessible label for the radiogroup role */
    ariaLabel?: string;
}

export function RadioGroup<T extends string = string>({
    options,
    value,
    onChange,
    label,
    disabled = false,
    className,
    ariaLabel,
}: RadioGroupProps<T>) {
    return (
        <div className={`${styles.wrapper} ${disabled ? styles.disabled : ''} ${className || ''}`}>
            {label && <label className={styles.label}>{label}</label>}
            <div
                className={styles.toggle}
                role="radiogroup"
                aria-label={ariaLabel || label}
            >
                {options.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        className={`${styles.button} ${value === opt.value ? styles.active : ''}`}
                        onClick={() => onChange(opt.value)}
                        role="radio"
                        aria-checked={value === opt.value}
                        disabled={disabled}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
