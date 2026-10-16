export function Label({ className = '', ...props }) {
  return <label className={`label ${className}`} {...props} />;
}
