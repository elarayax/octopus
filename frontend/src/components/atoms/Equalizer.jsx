// Barritas animadas: indican voz en curso.
export function Equalizer({ idle = false, title }) {
  return (
    <span className={`eq ${idle ? 'eq--idle' : ''}`} title={title} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}