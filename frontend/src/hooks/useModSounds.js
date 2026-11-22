import { useCallback } from 'react';
import { LoadModSound } from '../../wailsjs/go/main/App';
import voiceJoinSound from '../assets/sounds/voice-join.mp3';
import voiceLeaveSound from '../assets/sounds/voice-leave.mp3';
import channelConnectSound from '../assets/sounds/channel-connect.mp3';

const DEFAULT_SOUNDS = {
  userJoined: voiceJoinSound,
  userLeft: voiceLeaveSound,
  peerConnected: channelConnectSound,
  localVoiceActivated: voiceJoinSound,
  // Alias de compatibilidad con la API inicial del hook.
  voiceJoin: voiceJoinSound,
  voiceLeave: voiceLeaveSound,
  channelConnect: channelConnectSound,
};

export function useModSounds() {
  const loadCustomSound = useCallback(async (filename) => {
    try {
      const asset = await LoadModSound(filename);
      if (!asset?.data || asset.mimeType !== 'audio/mpeg') return null;
      return `data:${asset.mimeType};base64,${asset.data}`;
    } catch (error) {
      console.debug('No se pudo cargar el sonido personalizado:', error);
      return null;
    }
  }, []);

  const playSound = useCallback(async (soundKey, customFilename = null) => {
    const fallback = DEFAULT_SOUNDS[soundKey];
    if (!fallback) return;

    const customSource = customFilename ? await loadCustomSound(customFilename) : null;
    try {
      const playback = new Audio(customSource || fallback).play();
      playback?.catch((error) => {
        console.debug('No se pudo reproducir el sonido:', error);
        if (customSource) {
          const fallbackPlayback = new Audio(fallback).play();
          fallbackPlayback?.catch((fallbackError) => console.debug('No se pudo reproducir el sonido predeterminado:', fallbackError));
        }
      });
    } catch (error) {
      console.debug('No se pudo iniciar el sonido:', error);
      if (customSource) {
        try {
          const playback = new Audio(fallback).play();
          playback?.catch((fallbackError) => console.debug('No se pudo reproducir el sonido predeterminado:', fallbackError));
        } catch (fallbackError) {
          console.debug('No se pudo iniciar el sonido predeterminado:', fallbackError);
        }
      }
    }
  }, [loadCustomSound]);

  return { playSound, loadCustomSound, modSounds: DEFAULT_SOUNDS };
}
