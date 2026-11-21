import { Avatar, Equalizer } from '../atoms';

function UserRow({ user, speaking }) {
  const status = user.online ? 'online' : 'offline';
  return (
    <li className={`users-panel__row ${user.online ? '' : 'users-panel__row--offline'}`}>
      <Avatar
        name={user.name}
        src={user.avatar}
        size={32}
        status={status}
        speaking={speaking}
      />
      <span className="users-panel__name">
        {user.name}
        {user.self && <em className="users-panel__you">(tú)</em>}
      </span>
      {speaking && <Equalizer title="Hablando" />}
    </li>
  );
}

/**
 * Lista de usuarios: tú y los peers conectados primero, luego los conocidos
 * de sesiones anteriores. `speaking`: llega audio remoto en este momento
 * (el backend no dice quién habla, así que se marca a los peers conectados).
 */
export function UsersPanel({ users, speaking = false, query = '' }) {
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
          {visible.map((u, i) => (
            <UserRow key={`${u.name}-${i}`} user={u} speaking={speaking && u.online && !u.self} />
          ))}
        </ul>
      )}
    </section>
  );
}