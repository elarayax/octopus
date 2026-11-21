import { Button, Icon } from '../atoms';
import { InputWithButton, DeviceSelect, LevelMeter, SliderRow } from '../molecules';

/**
 * Ajustes (modal): perfil (nombre + foto) y audio (micrófono, niveles y volúmenes).
 */
export function SettingsModal({ open, onClose, username, onUsernameChange, onSaveUsername, avatar, onPickAvatar, call }) {
  if (!open) return null;

  return (
    <div className="settings-modal__overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal__header">
          <h3>Perfil y audio</h3>
          <Button variant="ghost" size="sm" onClick={onClose} title="Cerrar">
            <Icon name="close" size={14} />
          </Button>
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
              Cambiar foto
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
            buttonLabel="Guardar nombre"
            onSubmit={onSaveUsername}
            variant="primary"
            submitOnEnter
          />
        </div>

        {call && (
          <>
            <h4 className="settings-modal__section-title">Audio</h4>
            <DeviceSelect
              devices={call.devices}
              value={call.selectedId}
              onChange={call.changeDevice}
              onRefresh={call.refreshDevices}
            />
            <LevelMeter ref={call.meterRef} />
            <SliderRow
              id="mic-gain"
              label="🎙️ Tu volumen"
              value={call.micGain}
              onChange={call.setMicGain}
              accent="var(--color-success-bright)"
            />
            <SliderRow
              id="playback-gain"
              label="🔊 Voz recibida"
              value={call.playbackGain}
              onChange={call.setPlaybackGain}
              accent="var(--color-info-soft)"
            />
          </>
        )}
      </div>
    </div>
  );
}