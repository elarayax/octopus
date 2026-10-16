// tone: idle | warning | success
export function StatusDot({ tone = 'idle' }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />;
}
