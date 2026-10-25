import { useEffect } from 'react';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import voiceJoinSound from '../assets/sounds/voice-join.mp3';
import voiceLeaveSound from '../assets/sounds/voice-leave.mp3';

export function useVoiceNotifications() {
  useEffect(() => {
    const play = (source) => {
      try {
        const playback = new Audio(source).play();
        playback?.catch((error) => console.debug('No se pudo reproducir el sonido de voz:', error));
      } catch (error) {
        console.debug('No se pudo iniciar el sonido de voz:', error);
      }
    };

    const offJoined = EventsOn('voice_peer_joined', () => play(voiceJoinSound));
    const offLeft = EventsOn('voice_peer_left', () => play(voiceLeaveSound));
    return () => {
      offJoined();
      offLeft();
    };
  }, []);
}
