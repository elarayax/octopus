import { useEffect, useRef } from 'react';
import { Icon } from '../atoms';

/** Filtra canales y usuarios. Ctrl/⌘ + K enfoca el campo. */
export function SearchBox({ value, onChange }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <label className="search-box">
      <Icon name="search" size={16} />
      <input
        ref={ref}
        className="search-box__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (onChange(''), e.currentTarget.blur())}
        placeholder="Buscar o ejecutar..."
        aria-label="Buscar canales y usuarios"
      />
      <kbd className="search-box__kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
    </label>
  );
}