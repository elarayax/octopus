import { STATUS } from '../../hooks/useP2P';

const VIEW = {
  [STATUS.IDLE]: { tone: 'idle', text: 'Sin conexión' },
  [STATUS.LISTENING]: { tone: 'warning', text: 'Esperando peers' },
  [STATUS.CONNECTING]: { tone: 'warning', text: 'Conectando…' },
  [STATUS.ONLINE]: { tone: 'success', text: 'En línea' },
};

export function SidebarBrand({ status, peers }) {
  const view = VIEW[status] ?? VIEW[STATUS.IDLE];
  return (
    <div className="brand">
      <span className="brand__logo" aria-hidden="true">🐙</span>
      <div>
        <h1 className="brand__name">octopus</h1>
        <div className="brand__status">
          <span className={`brand__dot brand__dot--${view.tone}`} />
          <span>
            {view.text}
            {status === STATUS.ONLINE && ` · ${peers} ${peers === 1 ? 'peer' : 'peers'}`}
          </span>
        </div>
      </div>
    </div>
  );
}