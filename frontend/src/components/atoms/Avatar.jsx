export function hueFrom(name = '') {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/**
 * Avatar circular: foto o inicial con color derivado del nombre.
 * status: 'online' | 'offline' | undefined (sin puntito).
 */
export function Avatar({ name = '?', src, size = 32, status, speaking = false, ring, className = '' }) {
  const style = { '--hue': hueFrom(name), '--size': `${size}px`, ...(ring ? { '--dot-ring': ring } : {}) };
  const classes = [
    'avatar',
    status === 'offline' && 'avatar--offline',
    speaking && 'avatar--speaking',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} style={style} title={name}>
      {src ? (
        <img src={src} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
      ) : (
        (name || '?').charAt(0).toUpperCase()
      )}
      {status && <span className={`avatar__dot avatar__dot--${status}`} />}
    </span>
  );
}