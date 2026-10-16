// type: info | success | error
export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast toast--${toast.type}`} role="status" aria-live="polite">
      {toast.message}
    </div>
  );
}
