import { InputWithButton } from '../molecules';

export function ServerPanel({ port, onChange, onStart }) {
  return (
    <div className="panel">
      <InputWithButton
        value={port}
        onChange={onChange}
        placeholder="Puerto (ej: 8080)"
        buttonLabel="Iniciar Servidor"
        variant="success"
        onSubmit={onStart}
      />
    </div>
  );
}
