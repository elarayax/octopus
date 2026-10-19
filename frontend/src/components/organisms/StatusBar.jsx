import { useState } from 'react';
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
  const canStart = status === STATUS.IDLE && server;

  // Identidad del canal (editables antes de iniciar el servidor)
  const [nombre, setNombre] = useState(server?.channel?.nombre ?? '');
  const [subtitulo, setSubtitulo] = useState(server?.channel?.subtitulo ?? '');
  const [icono, setIcono] = useState(server?.channel?.icono ?? '');

  const startAndClose = async () => {
    if (server.onSaveChannel && (nombre.trim() || icono.trim())) {
      await server.onSaveChannel(nombre, subtitulo, icono);
    }
    server.onStart();
    setPortOpen(false);
  };

  return (
    <div className="status-bar">
      <StatItem label="Estado">
        <StatusDot tone={view.tone} /> <span>{view.text}</span>
      </StatItem>

      {canStart && (
        <div className="status-bar__server">
          <Button variant="success" size="sm" onClick={startAndClose}>
            ▶ Iniciar Servidor
          </Button>
          <div className="status-bar__port">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPortOpen((o) => !o)}
              title={`Configurar servidor (puerto: ${server.port})`}
            >
              ⚙️
            </Button>
            {portOpen && (
              <div className="port-popover port-popover--wide">
                <div className="port-popover__row">
                  <label className="port-popover__label" htmlFor="channel-icon">
                    Ícono
                  </label>
                  <Input
                    id="channel-icon"
                    className="port-popover__icon"
                    value={icono}
                    onChange={(e) => setIcono(e.target.value)}
                    placeholder="🐙"
                    maxLength={4}
                  />
                  <label className="port-popover__label" htmlFor="port-input">
                    Puerto
                  </label>
                  <Input
                    id="port-input"
                    className="port-popover__port"
                    value={server.port}
                    onChange={(e) => server.onPortChange(e.target.value)}
                    placeholder="8080"
                  />
                </div>
                <div className="port-popover__row">
                  <Input
                    id="channel-name"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && startAndClose()}
                    placeholder="Nombre del canal (ej: Lab de Redes)"
                  />
                </div>
                <div className="port-popover__row">
                  <Input
                    id="channel-subtitle"
                    value={subtitulo}
                    onChange={(e) => setSubtitulo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && startAndClose()}
                    placeholder="Subtítulo (ej: chat del curso)"
                  />
                </div>
                <div className="port-popover__row port-popover__row--actions">
                  <Button variant="success" size="sm" onClick={startAndClose}>
                    ▶ Iniciar con esta identidad
                  </Button>
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
