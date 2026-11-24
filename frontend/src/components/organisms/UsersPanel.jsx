import { Avatar, Equalizer, Icon } from '../atoms';

function UserRow({ user, speaking, muted, deafened, inCall }) {
  const status = user.online ? 'online' : 'offline';
  return (
    <li className={`users-panel__row ${user.online ? '' : 'users-panel__row--offline'}`}>
      <Avatar
        name={user.name}
        src={user.avatar}
        size={32}
        status={status}
        speaking={speaking}
        muted={muted}
      />
      <span className="users-panel__name">
        {user.name}
        {user.self && <em className="users-panel__you">(tú)</em>}
      </span>
      {deafened && <Icon name="volume-off" size={14} className="users-panel__flag users-panel__flag--off" title="Audio silenciado" />}
      {muted && <Icon name="mic-off" size={14} className="users-panel__flag users-panel__flag--off" title="Micrófono silenciado" />}
      {inCall && !muted && !speaking && <Icon name="mic" size={14} className="users-panel__flag" title="En la llamada de voz" />}
      {speaking && <Equalizer title="Hablando" />}
    </li>
  );
}

/**
 * Lista de usuarios: tú y los peers conectados primero, luego los conocidos
 * de sesiones anteriores. `speaking`: llega audio remoto en este momento
 * (el backend no dice quién habla, así que se marca a los peers conectados
 * que no tengan el micrófono silenciado).
 * Íconos de micrófono silenciado / audio silenciado:
 *  - tu fila usa selfMuted / selfDeafened
 *  - las demás usan memberStates: { [nombre]: { muted, deafened } }
 */
export function UsersPanel({
  users,
  speaking = false,
  query = '',
  callMembers = [],
  memberStates = {},
  selfInCall = false,
  selfMuted = false,
  selfDeafened = false,
}) {
  const q = query.trim().toLowerCase();
  const visible = users.filter((u) => !q || u.name.toLowerCase().includes(q));
  const online = users.filter((u) => u.online).length;

  return (
    <section className="panel users-panel">
      <h3 className="section-title">
        Usuarios · {online}/{users.length}
      </h3>
      {visible.length === 0 ? (
        <p className="users-panel__empty">
          {q ? 'Sin coincidencias.' : 'Aún no hay usuarios conocidos.'}
        </p>
      ) : (
        <ul className="users-panel__list">
          {visible.map((u, i) => {
            const inCall = u.self ? selfInCall : callMembers.includes(u.name);
            const st = u.self ? null : memberStates[u.name];
            const muted = u.self ? selfInCall && selfMuted : inCall && !!st?.muted;
            const deafened = u.self ? selfInCall && selfDeafened : inCall && !!st?.deafened;
            return (
              <UserRow
                key={`${u.name}-${i}`}
                user={u}
                speaking={speaking && u.online && !u.self && !muted}
                muted={muted}
                deafened={deafened}
                inCall={inCall}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}