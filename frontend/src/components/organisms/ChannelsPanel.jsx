import { Button } from '../atoms';

function ChannelIcon({ icono }) {
  if (icono && icono.startsWith('data:image')) {
    return <img className="channel-row__img" src={icono} alt="" />;
  }
  return <span className="channel-row__emoji">{icono || '🐙'}</span>;
}

export function ChannelsPanel({
  channels,
  ownCode,
  selectedCode,
  connectedCodes = [],
  connectingCodes = [],
  onSwitch,
  onConnect,
}) {
  if (!channels || channels.length === 0) {
    return (
      <section className="panel channels-panel">
        <h3 className="panel__title">Canales</h3>
        <p className="channels-panel__empty">Aún no hay canales guardados.</p>
      </section>
    );
  }

  return (
    <section className="panel channels-panel">
      <h3 className="panel__title">Canales</h3>
      <ul className="channels-panel__list">
        {channels.map((c) => {
          const isPersonal = c.codigo === ownCode;
          const isLocal = c.codigo === 'LOCAL';
          const isSelected = c.codigo === selectedCode;
          const isConnected = connectedCodes.includes(c.codigo);
          const isConnecting = connectingCodes.includes(c.codigo);
          const canConnect = !isPersonal && !isLocal && /^[A-Z0-9]{6}$/.test(c.codigo);
          const rowClasses = [
            'channel-row',
            isPersonal && 'channel-row--personal',
            isSelected && 'channel-row--selected',
            isConnecting && 'channel-row--connecting',
            isConnected && 'channel-row--connected',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li key={c.codigo} className={rowClasses}>
              <button className="channel-row__main" onClick={() => onSwitch(c.codigo)} title="Cambiar a este canal">
                <ChannelIcon icono={c.icono} />
                <div className="channel-row__text">
                  <span className="channel-row__name">{c.nombre}</span>
                  {c.subtitulo && <span className="channel-row__sub">{c.subtitulo}</span>}
                  <span className="channel-row__code">{c.codigo}</span>
                </div>
              </button>
              {canConnect && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="channel-row__connect"
                  onClick={() => onConnect(c.codigo)}
                  disabled={isConnected || isConnecting}
                  title={isConnected ? `Conectado a ${c.codigo}` : isConnecting ? `Conectando a ${c.codigo}` : `Conectarse a ${c.codigo}`}
                >
                  {isConnected ? '✓' : isConnecting ? '…' : '▶'}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
