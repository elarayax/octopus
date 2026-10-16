import { useState, useEffect, useCallback } from 'react';
import { GetUsers } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

/**
 * Lista de usuarios: tú, los peers conectados (activos) y los conocidos
 * de sesiones anteriores (inactivos). Se refresca ante cualquier evento P2P.
 */
export function useUsers() {
  const [users, setUsers] = useState([]);

  const refresh = useCallback(() => {
    GetUsers()
      .then((list) => setUsers(list || []))
      .catch((err) => console.error('Error cargando usuarios:', err));
  }, []);

  useEffect(() => {
    refresh();
    const offs = [
      EventsOn('peer_connected', refresh),
      EventsOn('peer_disconnected', refresh),
      EventsOn('peer_info', refresh),
    ];
    return () => offs.forEach((off) => off());
  }, [refresh]);

  // Mapa nombre -> avatar para pintar fotos en los mensajes del chat
  const avatarByName = Object.fromEntries(
    users.filter((u) => u.avatar).map((u) => [u.name, u.avatar])
  );

  return { users, refresh, avatarByName };
}
