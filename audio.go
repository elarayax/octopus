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
// de descartar el chunk nuevo. Un stream de voz es ~45 KB/s (512 muestras a
// 16 kHz en base64+JSON), así que 32 KB equivalen a ~700 ms.
//
// Por qué no un valor más bajo: `BufferedAmount` cuenta también lo enviado
// pero aún no confirmado, así que hay un "suelo" de tasa × RTT. En el host,
// con 3 personas, el canal hacia un peer lleva el audio propio más el
// reenviado del otro (≈90 KB/s); a 200 ms de RTT eso ya son ~18 KB de suelo.
// Con 8 KB el umbral se superaba en cada ida y vuelta y se descartaban
// chunks sin haber congestión real → la voz sonía robótica por los cortes
// periódicos de 32 ms.
//
// 32 KB cubre ese suelo con margen (hasta ~350 ms de RTT con dos streams) y
// solo se activa cuando el enlace de verdad no da abasto. El retaso acotado
// real lo fija el video (`maxVideoBuffered`), no este umbral.
const maxAudioBuffered = 32 * 1024

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

	// `Code` es lo que permite al receptor identificar al hablante cuando el
	// audio viaja reenviado por el host: sin él, el receptor lo atribuiría al
	// peer directo (el host) y mezclaría dos voces en el mismo búfer.
	pkt := Packet{
		Type:   "audio",
		Sender: currentUser,
		Audio:  audioB64,
		Code:   a.myCode,
	}

	data, err := json.Marshal(pkt)
	if err != nil {
		return "Error"
	}

	str := string(data)
	sent, dropped := 0, 0
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
			dropped++
			continue
		}
		if err := ch.SendText(str); err != nil {
			dropped++
			continue
		}
		sent++
	}

	// El resultado lo registra el frontend (rate-limited) para poder confirmar
	// si un problema de voz viene del envío o de la reproducción.
	if sent == 0 && dropped > 0 {
		return "DROP_ALL"
	}
	if dropped > 0 {
		return "DROP"
	}
	if sent == 0 {
		return "No peers"
	}
	return "OK"
}
