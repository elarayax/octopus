import { useState, useCallback } from 'react';
import { useAudioPrefs } from './useAudioPrefs';
import { useAudioDevices } from './useAudioDevices';
import { useAudioPlayback } from './useAudioPlayback';
import { useMicCapture } from './useMicCapture';

export function useVoiceCall({ notify }) {
  const prefs = useAudioPrefs();
  const devices = useAudioDevices();
  const playback = useAudioPlayback(prefs.playbackGain);

  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const mic = useMicCapture({ gain: prefs.micGain, muted });

  const join = useCallback(async () => {
    try {
      await mic.start(devices.selectedId);
      await playback.resume();
      devices.refresh(); // tras el permiso aparecen los nombres de los micrófonos
      setMuted(false);
      setActive(true);
    } catch (err) {
      notify(`Error activando micrófono: ${err.message}`, 'error');
    }
  }, [mic, playback, devices, notify]);

  const leave = useCallback(() => {
    mic.stop();
    setActive(false);
  }, [mic]);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

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
  };
}
