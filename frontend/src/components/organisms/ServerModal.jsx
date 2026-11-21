import { useState, useEffect } from 'react';
import { Button, Input, Icon } from '../atoms';

/**
 * Servidor + identidad del canal (antes vivía en un popover de la barra de estado).
 * Antes de iniciar: define puerto, nombre, subtítulo e ícono y arranca.
 * Con el servidor activo: solo edita la identidad del canal.
 */
export function ServerModal({ open, onClose, isStarted, server }) {
  const [nombre, setNombre] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [icono, setIcono] = useState('');

  // Sincronizar con el canal activo cada vez que se abre
  useEffect(() => {
    if (open && server?.channel) {
      setNombre(server.channel.nombre ?? '');
      setSubtitulo(server.channel.subtitulo ?? '');
      setIcono(server.channel.icono ?? '');
    }
  }, [open, server?.channel?.nombre, server?.channel?.subtitulo, server?.channel?.icono]);

  if (!open || !server) return null;

  const saveAndClose = async () => {
    await server.onSaveChannel?.(nombre, subtitulo, icono);
    onClose();
  };

  const startAndClose = async () => {
    if (nombre.trim() || subtitulo.trim() || icono.trim()) {
      await server.onSaveChannel?.(nombre, subtitulo, icono);
    }
    server.onStart?.();
    onClose();
  };

  const pickImageIcon = async () => {
    const res = await server.onSetChannelIcon?.();
    if (res && res.startsWith('data:image')) setIcono(res);
    else if (res && res !== 'Enviado') console.error(res);
  };

  const submit = () => (isStarted ? saveAndClose() : startAndClose());
  const hasImage = icono && icono.startsWith('data:image');

  return (
    <div className="settings-modal__overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal__header">
          <h3>{isStarted ? 'Editar canal' : 'Iniciar servidor'}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} title="Cerrar">
            <Icon name="close" size={14} />
          </Button>
        </div>

        <div className="settings-modal__form">
          <div className="settings-modal__row">
            <Button variant="secondary" size="sm" onClick={pickImageIcon} title="Usar imagen como ícono del canal">
              <Icon name="image" size={16} />
            </Button>
            {hasImage ? (
              <img className="settings-modal__icon-preview" src={icono} alt="" />
            ) : (
              <Input
                className="settings-modal__icon-input"
                value={icono}
                onChange={(e) => setIcono(e.target.value)}
                placeholder="🐙"
                maxLength={4}
                aria-label="Ícono del canal"
              />
            )}
            <label className="settings-modal__label" htmlFor="port-input">
              Puerto
            </label>
            <Input
              id="port-input"
              className="settings-modal__port"
              value={server.port}
              onChange={(e) => server.onPortChange(e.target.value)}
              placeholder="8080"
              disabled={isStarted}
              title={isStarted ? 'Puerto fijado para la sesión activa' : undefined}
            />
          </div>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Nombre del canal (ej: Lab de Redes)"
            aria-label="Nombre del canal"
          />
          <Input
            value={subtitulo}
            onChange={(e) => setSubtitulo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Subtítulo (ej: chat del curso)"
            aria-label="Subtítulo del canal"
          />
          <div className="settings-modal__row settings-modal__row--actions">
            <Button variant="primary" onClick={submit}>
              {isStarted ? 'Guardar cambios' : 'Iniciar con esta identidad'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}