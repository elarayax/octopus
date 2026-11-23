import { Icon } from '../atoms';
import { STATUS } from '../../hooks/useP2P';

function ChannelIcon({ icono }) {
  if (icono && icono.startsWith('data:image')) {
    return <img className="channel-row__img" src={icono} alt="" />;
  }
  return <span className="channel-row__emoji">{icono || '🐙'}</span>;
}

/**
 * Lista de canales recientes.
 * - La campana silencia las notificaciones del canal (mutedCodes / onToggleMute).
 * - Seleccionar (clic en la tarjeta) no conecta: solo cambia el historial que se ve.
 * - El botón Play cambia de canal y luego conecta.
 * Estados por tarjeta: seleccionada (currentCode/selectedCode), personal (ownCode),
 * conectando (connectingCodes) y conectada (connectedCodes).
 */
export function ChannelsPanel({
  channels,
  currentCode,
  ownCode,
  selectedCode,
  connectedCodes = [],
  connectingCodes = [],
  onSwitch,
  onConnect,
  mutedCodes = [],
  onToggleMute,
  status,
  query = '',
}) {
  const q = query.trim().toLowerCase();
  const list = (channels || []).filter(
    (c) => !q || `${c.nombre} ${c.subtitulo} ${c.codigo}`.toLowerCase().includes(q)
  );

  const activeCode = selectedCode || currentCode;
  // No se puede iniciar otra conexión manual mientras hay una en curso
  const canConnectNow = status !== STATUS.CONNECTING;

  return (
    <section className="panel channels-panel">
      <h3 className="section-title">Canales</h3>
      {list.length === 0 ? (
        <p className="channels-panel__empty">
          {q ? 'Sin coincidencias.' : 'Aún no hay canales guardados.'}
        </p>
      ) : (
        <ul className="channels-panel__list">
          {list.map((c) => {
            const isCurrent = c.codigo === activeCode;
            const isPersonal = !!ownCode && c.codigo === ownCode;
            const isLocal = c.codigo === 'LOCAL';
            const isConnected = connectedCodes.includes(c.codigo);
            const isConnecting = connectingCodes.includes(c.codigo);
            const isMuted = mutedCodes.includes(c.codigo);
            const showConnect = !isPersonal && !isLocal && /^[A-Z0-9]{6}$/.test(c.codigo);
            const rowClasses = [
              'channel-row',
              isCurrent && 'channel-row--current',
              isPersonal && 'channel-row--personal',
              isConnecting && 'channel-row--connecting',
              isConnected && 'channel-row--connected',
              isMuted && 'channel-row--muted',
              showConnect && 'channel-row--connectable', // ← nueva: la fila tiene botón de conectar
            ]
              .filter(Boolean)
              .join(' ');
            const connectTitle = isConnected
              ? `Conectado a ${c.codigo}`
              : isConnecting
                ? `Conectando a ${c.codigo}...`
                : `Conectarse a ${c.codigo}`;

            return (
              <li key={c.codigo} className={rowClasses}>
                <button
                  className="channel-row__main"
                  onClick={() => onSwitch(c.codigo)}
                  title={`Cambiar a este canal (${c.codigo})`}
                >
                  <span className="channel-row__icon">
                    <ChannelIcon icono={c.icono} />
                  </span>
                  <span className="channel-row__text">
                    <span className="channel-row__name">
                      {c.nombre}
                      {isMuted && <Icon name="bell-off" size={13} className="channel-row__muted-icon" />}
                    </span>
                    {c.subtitulo && <span className="channel-row__sub">{c.subtitulo}</span>}
                    <span className="channel-row__code">{c.codigo}</span>
                  </span>
                </button>
                {onToggleMute && (
                  <button
                    className={`channel-row__mute ${isMuted ? 'is-on' : ''}`}
                    onClick={() => onToggleMute(c.codigo)}
                    title={isMuted ? 'Activar notificaciones' : 'Silenciar canal'}
                    aria-pressed={isMuted}
                    aria-label={`${isMuted ? 'Activar notificaciones de' : 'Silenciar'} ${c.nombre}`}
                  >
                    <Icon name={isMuted ? 'bell-off' : 'bell'} size={14} />
                  </button>
                )}
                {showConnect && (
                  <button
                    className="channel-row__connect"
                    onClick={() => onConnect(c.codigo)}
                    disabled={isConnected || isConnecting || !canConnectNow}
                    title={connectTitle}
                    aria-label={`${connectTitle} (${c.nombre})`}
                  >
                    {isConnected ? '✓' : isConnecting ? '…' : <Icon name="play" size={12} />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}