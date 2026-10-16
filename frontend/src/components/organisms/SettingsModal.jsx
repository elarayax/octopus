import { Button } from '../atoms';
import { InputWithButton } from '../molecules';

/**
 * Panel de configuración de usuario (modal):
 * nombre de usuario + foto de perfil (imagen estática o GIF).
 */
export function SettingsModal({ open, onClose, username, onUsernameChange, onSaveUsername, avatar, onPickAvatar }) {
  if (!open) return null;

  return (
    <div className="settings-modal__overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal__header">
          <h3>⚙️ Configuración de usuario</h3>
          <Button variant="ghost" size="sm" onClick={onClose} title="Cerrar">✕</Button>
        </div>

        <div className="settings-modal__avatar-row">
          {avatar ? (
            <img className="settings-modal__avatar" src={avatar} alt="Tu foto de perfil" />
          ) : (
            <span className="settings-modal__avatar settings-modal__avatar--placeholder" aria-hidden="true">
              {(username || '?').charAt(0).toUpperCase()}
            </span>
          )}
          <div className="settings-modal__avatar-info">
            <Button variant="secondary" size="sm" onClick={onPickAvatar}>
              🖼️ Cambiar foto
            </Button>
            <p className="settings-modal__hint">
              PNG, JPG, WebP o GIF animado. Se optimiza a WebP automáticamente y se comparte con tus peers.
            </p>
          </div>
        </div>

        <div className="settings-modal__field">
          <InputWithButton
            value={username}
            onChange={onUsernameChange}
            placeholder="Tu nombre de usuario"
            buttonLabel="Guardar Nombre"
            onSubmit={onSaveUsername}
            variant="success"
            submitOnEnter
          />
        </div>
      </div>
    </div>
  );
}
