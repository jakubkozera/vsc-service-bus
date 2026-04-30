/**
 * Hook for detecting VS Code theme changes
 */
import { useState, useEffect } from 'react';
import { VSCodeThemeKind } from '../types';

export function useVSCodeTheme(): VSCodeThemeKind {
  const [theme, setTheme] = useState<VSCodeThemeKind>(() => {
    const kind = document.body.getAttribute('data-vscode-theme-kind');
    return (kind as VSCodeThemeKind) || 'vscode-dark';
  });

  useEffect(() => {
    const updateTheme = () => {
      const themeKind = document.body.getAttribute('data-vscode-theme-kind');
      const themeName = document.body.getAttribute('data-vscode-theme-name');
      
      let effectiveKind: VSCodeThemeKind = 'vscode-dark';
      
      if (themeKind) {
        effectiveKind = themeKind as VSCodeThemeKind;
      } else if (themeName) {
        if (themeName.toLowerCase().includes('light')) {
          effectiveKind = 'vscode-light';
        } else if (themeName.toLowerCase().includes('high contrast')) {
          effectiveKind = 'vscode-high-contrast';
        }
      }
      
      setTheme(effectiveKind);
      
      // Ensure body has the theme attribute
      if (document.body.getAttribute('data-vscode-theme-kind') !== effectiveKind) {
        document.body.setAttribute('data-vscode-theme-kind', effectiveKind);
      }
    };

    // Initial update
    updateTheme();

    // Listen for theme changes
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'data-vscode-theme-kind' ||
            mutation.attributeName === 'data-vscode-theme-name')
        ) {
          shouldUpdate = true;
        }
      });

      if (shouldUpdate) {
        updateTheme();
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-vscode-theme-kind', 'data-vscode-theme-name'],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}
