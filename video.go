package main

import (
	"encoding/json"

	"github.com/pion/webrtc/v4"
)

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
		if s.dcv != nil && s.dcv.ReadyState() == webrtc.DataChannelStateOpen {
			_ = s.dcv.SendText(str)
		}
	}
	return "OK"
}
