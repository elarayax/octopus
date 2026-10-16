import { Button } from '../atoms';

export function NodeInfoCard({ code, onCopy }) {
  return (
    <div className="node-card">
      <div>
        <strong>Tu ID Fijo:</strong> <span className="node-card__code">{code}</span>
      </div>
      <div className="node-card__hint">
        Este ID es permanente para este puerto. Tus amigos pueden usarlo para conectarse contigo siempre.
      </div>
      <Button size="sm" onClick={() => onCopy(code)}>
        📋 Copiar ID Fijo para invitar
      </Button>
    </div>
  );
}
