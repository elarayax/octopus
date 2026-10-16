import { StatusDot } from '../atoms';
import { StatItem } from '../molecules';
import { STATUS } from '../../hooks/useP2P';

const STATUS_VIEW = {
  [STATUS.IDLE]: { tone: 'idle', text: 'Servidor no iniciado' },
  [STATUS.LISTENING]: { tone: 'warning', text: 'Servidor activo, esperando conexiones...' },
  [STATUS.CONNECTING]: { tone: 'warning', text: 'Conectando con peer...' },
  [STATUS.ONLINE]: { tone: 'success', text: 'En línea - P2P WebRTC' },
};

export function StatusBar({ status, peers }) {
  const view = STATUS_VIEW[status] ?? STATUS_VIEW[STATUS.IDLE];
  return (
    <div className="status-bar">
      <StatItem label="Estado">
        <StatusDot tone={view.tone} /> <span>{view.text}</span>
      </StatItem>
      <StatItem label="Peers activos">
        <span className="status-bar__peers">{peers}</span>
      </StatItem>
    </div>
  );
}
