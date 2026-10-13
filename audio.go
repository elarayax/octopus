package main

import (
	"encoding/json"

	"github.com/pion/webrtc/v4"
)

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
