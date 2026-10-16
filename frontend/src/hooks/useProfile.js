import { useState, useEffect, useCallback } from 'react';
import { GetUsername, SetUsername, GetAvatar, SetAvatarFromDialog } from '../../wailsjs/go/main/App';

export function useProfile({ notify }) {
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');

  useEffect(() => {
    GetUsername()
      .then((name) => name && setUsername(name))
      .catch((err) => console.error('Error cargando nombre de usuario:', err));

    GetAvatar()
      .then((dataUrl) => dataUrl && setAvatar(dataUrl))
      .catch((err) => console.error('Error cargando avatar:', err));
  }, []);

  const save = useCallback(async () => {
    try {
      const name = await SetUsername(username);
      notify(`Nombre guardado: ${name}`, 'success');
    } catch (err) {
      notify(`No se pudo guardar el nombre: ${err}`, 'error');
    }
  }, [username, notify]);

  const pickAvatar = useCallback(async () => {
    try {
      const res = await SetAvatarFromDialog();
      if (!res) return; // usuario canceló el diálogo
      if (res.startsWith('Error:')) {
        notify(res, 'error');
        return;
      }
      setAvatar(res);
      notify('¡Foto de perfil actualizada!', 'success');
    } catch (err) {
      notify(`No se pudo cambiar la foto: ${err}`, 'error');
    }
  }, [notify]);

  return { username, setUsername, save, avatar, pickAvatar };
}
