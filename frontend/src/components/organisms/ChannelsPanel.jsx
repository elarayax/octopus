import { Button } from '../atoms';

function ChannelIcon({ icono }) {
  if (icono && icono.startsWith('data:image')) {
    return <img className="channel-row__img" src={icono} alt="" />;
  }
  return <span className="channel-row__emoji">{icono || '🐙'}</span>;
}

export function ChannelsPanel({ channels, currentCode, onSwitch, onConnect, status }) {
  if (!channels || channels.length === 0) {
    return (
      <section className="panel channels-panel">
        <h3 className="panel__title">Canales</h3>
        <p className="channels-panel__empty">Aún no hay canales guardados.</p>
      </section>
    );
  }

  const idle = status === 'IDLE';

  return (
    <section className="panel channels-panel">
      <h3 className="panel__title">Canales</h3>
      <ul className="channels-panel__list">
        {channels.map((c) => {
          const isCurrent = c.codigo === currentCode;
          return (
            <li key={c.codigo} className={`channel-row ${isCurrent ? 'channel-row--current' : ''}`}>
              <button className="channel-row__main" onClick={() => onSwitch(c.codigo)} title="Cambiar a este canal">
                <ChannelIcon icono={c.icono} />
                <div className="channel-row__text">
                  <span className="channel-row__name">{c.nombre}</span>
                  {c.subtitulo && <span className="channel-row__sub">{c.subtitulo}</span>}
                  <span className="channel-row__code">{c.codigo}</span>
                </div>
              </button>
              {idle && !isCurrent && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="channel-row__connect"
                  onClick={() => onConnect(c.codigo)}
                  title={`Conectarse a ${c.codigo}`}
                >
                  ▶
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
