export function StatItem({ label, children }) {
  return (
    <div className="stat-item">
      <strong>{label}:</strong> {children}
    </div>
  );
}
