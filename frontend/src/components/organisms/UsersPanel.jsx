import { StatusDot } from '../atoms';

function UserRow({ user }) {
  return (
    <li className={`users-panel__row ${user.online ? '' : 'users-panel__row--offline'}`}>
      {user.avatar ? (
        <img className="users-panel__avatar" src={user.avatar} alt="" />
      ) : (
        <span className="users-panel__avatar users-panel__avatar--placeholder" aria-hidden="true">
          {(user.name || '?').charAt(0).toUpperCase()}
        </span>
      )}
      <span className="users-panel__name">
        {user.name}
        {user.self && <em className="users-panel__you">(tú)</em>}
      </span>
      <span className="users-panel__status" title={user.online ? 'Activo' : 'Inactivo'}>
        <StatusDot tone={user.online ? 'success' : 'idle'} />
        {user.online ? 'Activo' : 'Inactivo'}
      </span>
    </li>
  );
}

/**
 * Lista de usuarios: tú y los peers conectados (activos) primero,
 * luego los conocidos de sesiones anteriores (inactivos).
 */
export function UsersPanel({ users }) {
  return (
    <div className="panel users-panel">
      <h4 className="users-panel__title">👥 Usuarios</h4>
      {users.length === 0 ? (
        <p className="users-panel__empty">Aún no hay usuarios conocidos.</p>
      ) : (
        <ul className="users-panel__list">
          {users.map((u, i) => (
            <UserRow key={`${u.name}-${i}`} user={u} />
          ))}
        </ul>
      )}
    </div>
  );
}
