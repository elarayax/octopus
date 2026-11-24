import { useState } from 'react';
import { Icon, Button } from '../atoms';
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
 * - Abandonar (solo si hay conexión) corta la conexión pero conserva el canal y su historial.
 * - Borrar elimina el canal y su historial de este equipo (pide confirmación en la propia fila).
 *   El canal personal y el LOCAL no se pueden borrar.
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
  onLeave,
  onDelete,
  status,
  query = '',
}) {
  // Código del canal cuya fila está pidiendo confirmación para borrar
  const [confirmCode, setConfirmCode] = useState(null);

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
            const canLeave = !!onLeave && !isPersonal && !isLocal && (isConnected || isConnecting);
            const canDelete = !!onDelete && !isPersonal && !isLocal;
            // Botones flotantes de la fila (para reservar sitio al texto al pasar el mouse)
            const actionSlots = [!!onToggleMute, showConnect, canLeave, canDelete].filter(Boolean).length;
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

            if (confirmCode === c.codigo) {
              return (
                <li
                  key={c.codigo}
                  className="channel-row channel-row--confirm"
                  onKeyDown={(e) => e.key === 'Escape' && setConfirmCode(null)}
                >
                  <div className="channel-row__confirm" role="alertdialog" aria-label={`Borrar ${c.nombre}`}>
                    <p className="channel-row__confirm-text">
                      ¿Borrar <strong>{c.nombre}</strong> y todo su historial? Solo se elimina en este equipo.
                    </p>
                    <div className="channel-row__confirm-actions">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setConfirmCode(null);
                          onDelete(c.codigo);
                        }}
                      >
                        Borrar
                      </Button>
                      <Button variant="ghost" size="sm" autoFocus onClick={() => setConfirmCode(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </li>
              );
            }

            return (
              <li
                key={c.codigo}
                className={rowClasses}
                style={{ '--row-actions': `${actionSlots * 28 + 12}px` }}
              >
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
                <div className="channel-row__actions">
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
                      {isConnected ? '✓' : <Icon name="play" size={12} />}
                    </button>
                  )}
                  {canLeave && (
                    <button
                      className="channel-row__action channel-row__leave"
                      onClick={() => onLeave(c.codigo)}
                      title={`Abandonar el canal (${c.codigo})`}
                      aria-label={`Abandonar ${c.nombre}`}
                    >
                      <Icon name="logout" size={14} />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      className="channel-row__action channel-row__delete"
                      onClick={() => setConfirmCode(c.codigo)}
                      title="Borrar canal e historial"
                      aria-label={`Borrar ${c.nombre}`}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}