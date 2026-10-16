import { useState, useEffect, useCallback } from 'react';
import { GetUsername, SetUsername } from '../../wailsjs/go/main/App';

export function useProfile({ notify }) {
  const [username, setUsername] = useState('');

  useEffect(() => {
    GetUsername()
      .then((name) => name && setUsername(name))
      .catch((err) => console.error('Error cargando nombre de usuario:', err));
  }, []);

  const save = useCallback(async () => {
    try {
      const name = await SetUsername(username);
      notify(`Nombre guardado: ${name}`, 'success');
    } catch (err) {
      notify(`No se pudo guardar el nombre: ${err}`, 'error');
    }
  }, [username, notify]);

  return { username, setUsername, save };
}
