import { useState, useEffect } from 'react';
import { Button, Input, StatusDot } from '../atoms';
import { StatItem } from '../molecules';
import { STATUS } from '../../hooks/useP2P';

const STATUS_VIEW = {
  [STATUS.IDLE]: { tone: 'idle', text: 'Servidor no iniciado' },
  [STATUS.LISTENING]: { tone: 'warning', text: 'Servidor activo, esperando conexiones...' },
  [STATUS.CONNECTING]: { tone: 'warning', text: 'Conectando con peer...' },
  [STATUS.ONLINE]: { tone: 'success', text: 'En línea - P2P WebRTC' },
};

export function StatusBar({ status, peers, server }) {
  const [portOpen, setPortOpen] = useState(false);
  const view = STATUS_VIEW[status] ?? STATUS_VIEW[STATUS.IDLE];
  const isStarted = status !== STATUS.IDLE;

  const [nombre, setNombre] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [icono, setIcono] = useState('');

  // Sincronizar con el canal activo cuando se abre el popover
  useEffect(() => {
    if (portOpen && server?.channel) {
      setNombre(server.channel.nombre ?? '');
      setSubtitulo(server.channel.subtitulo ?? '');
      setIcono(server.channel.icono ?? '');
    }
  }, [portOpen, server?.channel?.nombre, server?.channel?.subtitulo, server?.channel?.icono]);

  const saveAndClose = async () => {
    if (server?.onSaveChannel) {
      await server.onSaveChannel(nombre, subtitulo, icono);
    }
    setPortOpen(false);
  };

  const startAndClose = async () => {
    if (server?.onSaveChannel && (nombre.trim() || subtitulo.trim() || icono.trim())) {
      await server.onSaveChannel(nombre, subtitulo, icono);
    }
    if (server?.onStart) {
      server.onStart();
    }
    setPortOpen(false);
  };

  const pickImageIcon = async () => {
    if (!server?.onSetChannelIcon) return;
    const res = await server.onSetChannelIcon();
    if (res && res.startsWith('data:image')) {
      setIcono(res);
    } else if (res && res !== 'Enviado') {
      console.error(res);
    }
  };

  return (
    <div className="status-bar">
      <StatItem label="Estado">
        <StatusDot tone={view.tone} /> <span>{view.text}</span>
      </StatItem>

      {server && (
        <div className="status-bar__server">
          {!isStarted && (
            <Button variant="success" size="sm" onClick={startAndClose}>
              ▶ Iniciar Servidor
            </Button>
          )}
          <div className="status-bar__port">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPortOpen((o) => !o)}
              title={isStarted ? 'Editar información del canal' : `Configurar servidor (puerto: ${server.port})`}
            >
              ⚙️ {isStarted ? <span style={{ fontSize: '0.8rem', marginLeft: '4px' }}>Editar</span> : ''}
            </Button>
            {portOpen && (
              <div className="port-popover port-popover--wide">
                <div className="port-popover__row">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={pickImageIcon}
                    title="Usar imagen como ícono del canal"
                  >
                    🖼️
                  </Button>
                  {icono && icono.startsWith('data:image') && (
                    <img className="port-popover__icon-preview" src={icono} alt="" />
                  )}
                  {(!icono || !icono.startsWith('data:image')) && (
                    <Input
                      id="channel-icon"
                      className="port-popover__icon"
                      value={icono}
                      onChange={(e) => setIcono(e.target.value)}
                      placeholder="🐙"
                      maxLength={4}
                    />
                  )}
                  <label className="port-popover__label" htmlFor="port-input">
                    Puerto
                  </label>
                  <Input
                    id="port-input"
                    className="port-popover__port"
                    value={server.port}
                    onChange={(e) => server.onPortChange(e.target.value)}
                    placeholder="8080"
                    disabled={isStarted}
                    title={isStarted ? 'Puerto fijado para la sesión activa' : undefined}
                  />
                </div>
                <div className="port-popover__row">
                  <Input
                    id="channel-name"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (isStarted ? saveAndClose() : startAndClose())}
                    placeholder="Nombre del canal (ej: Lab de Redes)"
                  />
                </div>
                <div className="port-popover__row">
                  <Input
                    id="channel-subtitle"
                    value={subtitulo}
                    onChange={(e) => setSubtitulo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (isStarted ? saveAndClose() : startAndClose())}
                    placeholder="Subtítulo (ej: chat del curso)"
                  />
                </div>
                <div className="port-popover__row port-popover__row--actions">
                  {isStarted ? (
                    <Button variant="success" size="sm" onClick={saveAndClose}>
                      💾 Guardar cambios
                    </Button>
                  ) : (
                    <Button variant="success" size="sm" onClick={startAndClose}>
                      ▶ Iniciar con esta identidad
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <StatItem label="Peers activos">
        <span className="status-bar__peers">{peers}</span>
      </StatItem>
    </div>
  );
}
