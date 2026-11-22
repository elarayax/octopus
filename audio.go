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

// maxAudioBuffered es cuánto audio puede quedar pendiente en un canal antes
// de descartar el chunk nuevo. A 16 kHz × 16 bit son ~31 KB/s, así que 8 KB
// equivalen a ~260 ms.
//
// Por qué no un valor más bajo: `BufferedAmount` cuenta también lo enviado
// pero aún no confirmado, así que en un enlace con RTT alto hay un "suelo"
// de rate×RTT (p. ej. 3 KB con 100 ms). 8 KB deja margen para ese suelo sin
// permitir que la voz se acumule medio segundo.
const maxAudioBuffered = 8 * 1024

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
		if ch == nil || ch.ReadyState() != webrtc.DataChannelStateOpen {
			continue
		}
		// Backpressure: los envíos de pion son no bloqueantes y se acumulan
		// en una cola SCTP sin límite. Si el enlace va lento, esa cola crece
		// y la voz llega segundos tarde. Para voz en vivo es mejor perder el
		// chunk que acumular retraso (el receptor también lo descartaría).
		if ch.BufferedAmount() > maxAudioBuffered {
			continue
		}
		_ = ch.SendText(str)
	}

	return "OK"
}
