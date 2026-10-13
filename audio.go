package main

import (
	"encoding/json"
	"strconv"

	"github.com/pion/webrtc/v4"
)

type AudioPrefs struct {
	MicGain      float64 `json:"micGain"`
	PlaybackGain float64 `json:"playbackGain"`
}

// SetAudioPrefs persiste los volúmenes configurados en la UI
func (a *App) SetAudioPrefs(micGain, playbackGain float64) {
	a.saveSetting("mic_gain", strconv.FormatFloat(micGain, 'f', -1, 64))
	a.saveSetting("playback_gain", strconv.FormatFloat(playbackGain, 'f', -1, 64))
}

// GetAudioPrefs devuelve los volúmenes guardados (1.0 = 100% por defecto)
func (a *App) GetAudioPrefs() AudioPrefs {
	prefs := AudioPrefs{MicGain: 1, PlaybackGain: 1}
	if v, err := strconv.ParseFloat(a.getSetting("mic_gain"), 64); err == nil {
		prefs.MicGain = v
	}
	if v, err := strconv.ParseFloat(a.getSetting("playback_gain"), 64); err == nil {
		prefs.PlaybackGain = v
	}
	return prefs
}

func (a *App) SendAudio(audioB64 string) string {
	a.mu.Lock()
	currentUser := a.username
	sessions := make([]*PeerSession, 0, len(a.peers))
	for _, s := range a.peers {
		sessions = append(sessions, s)
	}
	a.mu.Unlock()

	if len(sessions) == 0 {
		return "No peers"
	}

	pkt := Packet{
		Type:   "audio",
		Sender: currentUser,
		Audio:  audioB64,
	}

	data, err := json.Marshal(pkt)
	if err != nil {
		return "Error"
	}

	str := string(data)
	for _, s := range sessions {
		// Preferir el canal de audio (no fiable, baja latencia); si no está
		// disponible, caer al canal de chat como respaldo.
		ch := s.dca
		if ch == nil || ch.ReadyState() != webrtc.DataChannelStateOpen {
			ch = s.dc
		}
		if ch != nil && ch.ReadyState() == webrtc.DataChannelStateOpen {
			_ = ch.SendText(str)
		}
	}

	return "OK"
}
