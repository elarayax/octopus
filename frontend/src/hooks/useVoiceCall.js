import { useState, useCallback, useEffect } from 'react';
import { SetCallState, SetVoicePresence, SetVoiceFlags } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { useAudioPrefs } from './useAudioPrefs';
import { useAudioDevices } from './useAudioDevices';
import { useAudioPlayback } from './useAudioPlayback';
import { useMicCapture } from './useMicCapture';

export function useVoiceCall({ notify }) {
  const prefs = useAudioPrefs();
  const devices = useAudioDevices();
  const [deafened, setDeafened] = useState(false);
  // Ensordecer = volumen 0 solo para ti; los demás siguen hablando y tú sigues enviando audio
  const playback = useAudioPlayback(deafened ? 0 : prefs.playbackGain);

  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const mic = useMicCapture({ gain: prefs.micGain, muted });

  // Los demás que están en la llamada, con su estado de micrófono/audio:
  // { [nombre]: { muted: bool, deafened: bool } }
  // Llegan por el evento call_state. Quien se desconecta del todo se filtra
  // en la UI con la lista de usuarios online.
  const [members, setMembers] = useState({});
  useEffect(
    () =>
      EventsOn('call_state', (name, inCall, isMuted, isDeafened) => {
        if (!name) return;
        setMembers((prev) => {
          if (!inCall) {
            if (!prev[name]) return prev;
            const next = { ...prev };
            delete next[name];
            return next;
          }
          const m = !!isMuted;
          const d = !!isDeafened;
          const cur = prev[name];
          if (cur && cur.muted === m && cur.deafened === d) return prev;
          return { ...prev, [name]: { muted: m, deafened: d } };
        });
      }),
    []
  );

  // Envía tu propio estado a los demás cada vez que cambia mientras estás en la llamada.
  // Al unirse corre después de SetCallState(true); al salir, Go limpia las banderas.
  useEffect(() => {
    if (!active) return;
    SetVoiceFlags(muted, deafened).catch((err) => console.error('SetVoiceFlags:', err));
  }, [active, muted, deafened]);

  const join = useCallback(async () => {
    try {
      await mic.start(devices.selectedId);
      await playback.resume();
      await SetVoicePresence(true);
      devices.refresh(); // tras el permiso aparecen los nombres de los micrófonos
      setMuted(false);
      setActive(true);
      SetCallState(true);
    } catch (err) {
      notify(`Error activando micrófono: ${err.message}`, 'error');
    }
  }, [mic, playback, devices, notify]);

  const leave = useCallback(() => {
    mic.stop();
    SetVoicePresence(false).catch((err) => console.error('SetVoicePresence:', err));
    setActive(false);
    setDeafened(false);
    SetCallState(false);
  }, [mic]);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleDeafen = useCallback(() => setDeafened((d) => !d), []);

  const changeDevice = useCallback(
    async (id) => {
      devices.setSelectedId(id);
      if (!active) return;
      try {
        await mic.start(id);
      } catch (err) {
        notify(`Error cambiando de micrófono: ${err.message}`, 'error');
      }
    },
    [active, mic, devices, notify]
  );

  return {
    active,
    muted,
    deafened,
    members: Object.keys(members),
    voiceStates: members,
    remoteSpeaking: playback.remoteSpeaking,
    devices: devices.devices,
    selectedId: devices.selectedId,
    refreshDevices: devices.refresh,
    changeDevice,
    micGain: prefs.micGain,
    setMicGain: prefs.setMicGain,
    playbackGain: prefs.playbackGain,
    setPlaybackGain: prefs.setPlaybackGain,
    meterRef: mic.meterRef,
    join,
    leave,
    toggleMute,
    toggleDeafen,
  };
}