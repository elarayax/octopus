// Los mensajes llegan como "YYYY-MM-DD HH:MM:SS" en UTC (SQLite) o ISO.
const SQLITE_UTC = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export function parseMsgTime(t) {
  if (!t) return null;
  const d = new Date(SQLITE_UTC.test(t) ? `${t.replace(' ', 'T')}Z` : t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Marca "ahora" con el mismo formato que usa la base de datos
export function nowUtc() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function formatClock(d) {
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function formatDayLabel(d, now = new Date()) {
  if (dayKey(d) === dayKey(now)) return 'Hoy';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return 'Ayer';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}

export { dayKey };

// "Lab de Redes" -> "lab-de-redes"
export function slugify(s = '') {
  return (
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'chat'
  );
}