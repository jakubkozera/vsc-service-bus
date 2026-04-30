/**
 * SharedDropdown Component - VS Code styled custom dropdown with search, keyboard navigation & animations
 *
 * React port of the vanilla JS SharedDropdown (src/shared/webview/components/dropdown).
 * Features: search/filter, full keyboard navigation, ARIA attributes, VSCode theme integration,
 * smooth animations, per-instance close behaviour.
 *
 * The options list is rendered via a React portal on document.body with position:fixed
 * so it is never clipped by parent overflow rules – matching the vanilla JS implementation.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import styles from './Dropdown.module.css';

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  /** Optional icon URI displayed before the label */
  iconUri?: string;
}

export interface DropdownProps {
  /** Array of selectable options */
  options: DropdownOption[];
  /** Currently selected value */
  value: string;
  /** Callback fired when selection changes */
  onChange: (value: string, label: string) => void;
  /** Placeholder text when no selection */
  placeholder?: string;
  /** Optional visible label rendered above the dropdown */
  label?: string;
  /** Disable the dropdown */
  disabled?: boolean;
  /** Additional CSS class for the wrapper */
  className?: string;
  /** Enable search / filter input inside the dropdown */
  enableSearch?: boolean;
  /** HTML id applied to the trigger button (useful for external <label htmlFor>) */
  id?: string;
  /** Auto-focus the trigger on mount */
  autoFocus?: boolean;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  disabled = false,
  className,
  enableSearch = false,
  id,
  autoFocus = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption?.label || placeholder;

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const q = searchQuery.toLowerCase();
    return options.filter(opt => opt.label.toLowerCase().includes(q));
  }, [options, searchQuery]);

  // Position the portal dropdown below the trigger (like vanilla JS _updateOpenState)
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: rect.width,
      width: 'auto',
    });
  }, []);

  // Close on outside click — must also check the portal container
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        optionsRef.current &&
        !optionsRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Reset search & highlight when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  // Position and focus when opening; reposition on scroll/resize while open
  useEffect(() => {
    if (isOpen) {
      updatePosition();

      if (enableSearch && searchInputRef.current) {
        const raf = requestAnimationFrame(() => searchInputRef.current?.focus());
        return () => cancelAnimationFrame(raf);
      }
    }
  }, [isOpen, enableSearch, updatePosition]);

  // Keep position in sync when the page scrolls or resizes while open
  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [isOpen, updatePosition]);

  // Auto-focus trigger on mount
  useEffect(() => {
    if (autoFocus && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [autoFocus]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
  }, [disabled]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (option: DropdownOption) => {
      onChange(option.value, option.label);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen(prev => !prev);
  }, [disabled]);

  // Scroll highlighted item into view
  const scrollToIndex = useCallback((index: number) => {
    if (!optionsRef.current) return;
    const items = optionsRef.current.querySelectorAll('[data-dropdown-option]');
    const el = items[index];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, []);

  // Keyboard navigation handler (shared between trigger and search input)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          openDropdown();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = Math.min(highlightedIndex + 1, filteredOptions.length - 1);
          setHighlightedIndex(next);
          scrollToIndex(next);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = Math.max(highlightedIndex - 1, 0);
          setHighlightedIndex(prev);
          scrollToIndex(prev);
          break;
        }
        case 'Home': {
          e.preventDefault();
          setHighlightedIndex(0);
          scrollToIndex(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          const last = filteredOptions.length - 1;
          setHighlightedIndex(last);
          scrollToIndex(last);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (filteredOptions.length === 1) {
            handleSelect(filteredOptions[0]);
          } else if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
            handleSelect(filteredOptions[highlightedIndex]);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          closeDropdown();
          break;
        }
        case 'Tab': {
          // Allow natural tab – close dropdown
          setIsOpen(false);
          break;
        }
      }
    },
    [isOpen, highlightedIndex, filteredOptions, openDropdown, closeDropdown, handleSelect, scrollToIndex],
  );

  // The options list – rendered via portal on document.body so it escapes overflow clipping
  // Only render when open to avoid visibility/styling issues
  const optionsList = isOpen ? (
    <div
      ref={optionsRef}
      className={`${styles.options} ${styles.optionsShow}`}
      style={dropdownStyle}
      role="listbox"
    >
      {enableSearch && (
        <div className={styles.searchWrapper}>
          <input
            ref={searchInputRef}
            className={styles.searchInput}
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            aria-label="Filter options"
          />
          <div className={styles.searchIcon}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
              <path d="M21 21l-6 -6" />
            </svg>
          </div>
        </div>
      )}
      {filteredOptions.map((option, index) => (
        <button
          key={option.value}
          id={`dropdown-option-${index}`}
          data-dropdown-option
          className={`${styles.option} ${option.iconUri ? styles.optionWithIcon : ''} ${option.value === value ? styles.selected : ''} ${
            index === highlightedIndex ? styles.highlighted : ''
          }`}
          onClick={() => handleSelect(option)}
          onMouseEnter={() => setHighlightedIndex(index)}
          type="button"
          role="option"
          aria-selected={option.value === value}
        >
          {option.iconUri && (
            <img src={option.iconUri} className={styles.optionIcon} alt="" aria-hidden="true" />
          )}
          <div className={styles.optionTextContent}>
            <span className={styles.optionLabel}>{option.label}</span>
            {option.description && (
              <span className={styles.optionDescription}>{option.description}</span>
            )}
          </div>
        </button>
      ))}
      {filteredOptions.length === 0 && (
        <div className={styles.noResults}>No results found</div>
      )}
    </div>
  ) : null;

  return (
    <div
      className={`${styles.container} ${className || ''}`}
      ref={containerRef}
    >
      {label && <label className={styles.label} htmlFor={id}>{label}</label>}
      <div className={styles.dropdown}>
        <button
          ref={triggerRef}
          id={id}
          className={`${styles.trigger} ${isOpen ? styles.open : ''}`}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-activedescendant={
            isOpen && highlightedIndex >= 0
              ? `dropdown-option-${highlightedIndex}`
              : undefined
          }
        >
          <div className={styles.triggerContent}>
            {selectedOption?.iconUri && (
              <img src={selectedOption.iconUri} className={styles.triggerIcon} alt="" aria-hidden="true" />
            )}
            <span className={!selectedOption ? styles.placeholder : ''}>
              {displayText}
            </span>
          </div>
          <svg
            className={styles.chevron}
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6l6 -6" />
          </svg>
        </button>

        {isOpen && createPortal(optionsList, document.body)}
      </div>
    </div>
  );
};
