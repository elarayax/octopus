package main

import (
	"encoding/json"

	"github.com/pion/webrtc/v4"
)

// maxVideoBuffered es cuánto video puede quedar pendiente antes de descartar
// el frame nuevo. 16 KB son ~1 frame de cámara o una fracción de uno de
// pantalla.
//
// Por qué: el audio y el video comparten la misma asociación SCTP, y los
// envíos de pion se encolan sin límite. Si el video se acumula, la voz queda
// detrás de él (head-of-line blocking) y llega tarde. El video tolera perder
// frames; una conversación no tolera esperar. Al descartar, el video se
// auto-regula a la velocidad real del enlace y deja hueco a la voz.
const maxVideoBuffered = 16 * 1024

// SendVideo envía un frame JPEG (base64) a todos los peers por el canal "video".
// kind: "cam" (cámara) o "screen" (pantalla compartida); ambos usan el mismo canal.
func (a *App) SendVideo(kind, frameB64 string) string {
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

	if kind != "screen" {
		kind = "" // cámara: sin campo, compatible con versiones anteriores
	}
	data, err := json.Marshal(Packet{Type: "video", Sender: currentUser, Video: frameB64, Kind: kind})
	if err != nil {
		return "Error"
	}

	str := string(data)
	for _, s := range sessions {
		// Solo canal de video: sin respaldo, para no tapar el chat con frames
		if s.dcv == nil || s.dcv.ReadyState() != webrtc.DataChannelStateOpen {
			continue
		}
		// Si ya hay un frame pendiente, este no vale: encolarlo solo añadiría
		// retraso (y taparía la voz, que comparte asociación).
		if s.dcv.BufferedAmount() > maxVideoBuffered {
			continue
		}
		_ = s.dcv.SendText(str)
	}
	return "OK"
}
