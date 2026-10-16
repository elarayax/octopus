import { InputWithButton } from '../molecules';

export function ProfilePanel({ username, onChange, onSave }) {
  return (
    <div className="panel">
      <InputWithButton
        value={username}
        onChange={onChange}
        placeholder="Tu nombre de usuario"
        buttonLabel="Guardar Nombre"
        onSubmit={onSave}
        submitOnEnter
      />
    </div>
  );
}
