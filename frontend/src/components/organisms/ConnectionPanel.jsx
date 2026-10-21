import { useState } from 'react';
import { InputWithButton } from '../molecules';

export function ConnectionPanel({ connect }) {
  const [address, setAddress] = useState('');

  return (
    <div className="panel">
      <InputWithButton
        value={address}
        onChange={setAddress}
        placeholder="Pega el ID Fijo de tu amigo (6 letras)..."
        buttonLabel="Conectar"
        variant="info"
        onSubmit={() => connect(address)}
        submitOnEnter
      />
    </div>
  );
}
