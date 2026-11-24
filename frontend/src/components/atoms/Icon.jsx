// Iconos de trazo (24x24), sin dependencias externas.
// Los mods pueden cambiar el estilo (iconPack) o reemplazar íconos sueltos (icons).
import { createContext, useContext, useMemo } from 'react';

const PATHS = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  'mic-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M9 9v2a3 3 0 0 0 5 2.2M15 10V6a3 3 0 0 0-5.7-1.3" />
      <path d="M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.6 2.8M12 18v3" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  clip: <path d="M21 12.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.4-8.4" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  bars: <path d="M5 10v4M9 6v12M13 9v6M17 4v16M21 11v2" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 0 0-14.5-4M4 5v4h4M4 13a8 8 0 0 0 14.5 4M20 19v-4h-4" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  play: <path d="M7 4.5v15l12-7.5z" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  screen: (
    <>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M8 20.5h8M12 16.5v4" />
    </>
  ),
  reply: <path d="M9.5 5L4 10.5 9.5 16M4 10.5h9a7 7 0 0 1 7 7V19" />,
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-8 8" />
    </>
  ),
  bell: <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9M10 20a2 2 0 0 0 4 0" />,
  'bell-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.6 4.8A6 6 0 0 1 18 9c0 3 .5 4.8 1.2 5.9M6 9c0 6-2 7.5-2 7.5h11M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  'volume-off': (
    <>
      <path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2" />
      <path d="M15.5 10.5l6-3.5v10l-6-3.5" />
    </>
  ),
  'video-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M15.5 15.5V18H4.5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H7M11 6h2.5a2 2 0 0 1 2 2v2.5l6-3.5v10" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.3a6.5 6.5 0 0 1 3.5 5.7" />
    </>
  ),
  hash: <path d="M5 9h15M4 15h15M10 4L8 20M16 4l-2 16" />,
  'arrow-down': <path d="M12 5v14M6 13l6 6 6-6" />,
  logout: <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />,
};

// Pack "emoji": cada ícono se reemplaza por un glifo (los mods pueden mezclar con `icons`).
const EMOJI_PACK = {
  mic: '🎙️', 'mic-off': '🔇', gear: '⚙️', clip: '📎', search: '🔍', bars: '📊', user: '👤',
  server: '🖥️', refresh: '🔄', folder: '📁', play: '▶️', close: '✖️', screen: '🖵', reply: '↩️',
  smile: '😊', image: '🖼️', bell: '🔔', 'bell-off': '🔕', volume: '🔊', 'volume-off': '🔈',
  video: '📹', 'video-off': '🚫', users: '👥', hash: '#️⃣', 'arrow-down': '⬇️', logout: '🚪', trash: '🗑️',
};

// Packs de estilo: solo cambian el trazo (el dibujo es el mismo).
const PACK_STYLE = {
  default: { strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
  fino: { strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' },
  grueso: { strokeWidth: 2.4, strokeLinecap: 'square', strokeLinejoin: 'miter' },
  relleno: { strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' },
};

// Un override es "datos de trazo" (solo números y comandos SVG) o un glifo de texto/emoji.
// Nunca se inyecta HTML: así un mod no puede colar scripts.
const PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa\d\s.,+-]+$/;
const isPathData = (v) => PATH_DATA.test(v) && /\d/.test(v);

const IconPackContext = createContext({ pack: 'default', overrides: {} });

export function IconPackProvider({ pack = 'default', overrides = {}, children }) {
  const value = useMemo(() => ({ pack, overrides }), [pack, overrides]);
  return <IconPackContext.Provider value={value}>{children}</IconPackContext.Provider>;
}

export function Icon({ name, size = 18, className = '', ...props }) {
  const { pack, overrides } = useContext(IconPackContext);

  // 1º lo que el mod defina para este ícono; 2º el pack emoji; 3º el dibujo propio
  const custom = overrides[name] ?? (pack === 'emoji' ? EMOJI_PACK[name] : undefined);
  const style = PACK_STYLE[pack] || PACK_STYLE.default;
  const packClass = `icon--pack-${PACK_STYLE[pack] ? pack : 'default'}`;

  // Glifo de texto / emoji
  if (typeof custom === 'string' && custom && !isPathData(custom)) {
    return (
      <span
        className={`icon icon--glyph ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.9 }}
        aria-hidden="true"
        {...props}
      >
        {custom}
      </span>
    );
  }

  return (
    <svg
      className={`icon ${packClass} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      {...style}
      aria-hidden="true"
      {...props}
    >
      {typeof custom === 'string' && custom ? <path d={custom} /> : PATHS[name]}
    </svg>
  );
}