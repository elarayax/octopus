import { useState } from 'react';
import { Button, Input } from '../atoms';

/** ID fijo para compartir + campo para unirse al ID de un amigo. */
export function InvitePanel({ code, onCopy, onConnect }) {
  const [friend, setFriend] = useState('');

  const join = () => {
    if (!friend.trim()) return;
    onConnect(friend.trim());
  };

  return (
    <section className="invite">
      <h3 className="invite__label">Invitar</h3>
      <div className="invite__code-row">
        <span className={`invite__code ${code ? '' : 'invite__code--empty'}`}>{code || '······'}</span>
        <button className="invite__copy" onClick={() => onCopy(code)} disabled={!code} title="Copiar ID fijo">
          Copiar
        </button>
      </div>
      <div className="invite__join">
        <Input
          value={friend}
          onChange={(e) => setFriend(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && join()}
          placeholder="ID de tu amigo"
          aria-label="ID de tu amigo"
        />
        <Button variant="neutral" onClick={join}>
          Unir
        </Button>
      </div>
    </section>
  );
}