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

  const startAndClose = () => {
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
          <Button variant="success" size="sm" onClick={server.onStart}>
            ▶ Iniciar Servidor
          </Button>
          <div className="status-bar__port">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPortOpen((o) => !o)}
              title={`Cambiar puerto (actual: ${server.port})`}
            >
              ⚙️
            </Button>
            {portOpen && (
              <div className="port-popover">
                <label className="port-popover__label" htmlFor="port-input">
                  Puerto
                </label>
                <Input
                  id="port-input"
                  value={server.port}
                  onChange={(e) => server.onPortChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startAndClose()}
                  placeholder="8080"
                />
                <Button variant="success" size="sm" onClick={startAndClose}>
                  Iniciar
                </Button>
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
