package main

import (
	"encoding/base64"
	"encoding/json"
	"os"

	"github.com/pion/webrtc/v4"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// SendImageFromDialog abre el selector de archivos, optimiza la imagen a WebP
// (animado si es GIF) y la envía como mensaje de chat a todos los peers.
// Devuelve "Enviado", "" si se canceló, o el error correspondiente.
func (a *App) SendImageFromDialog() string {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Enviar imagen al chat",
		Filters: []runtime.FileFilter{
			{DisplayName: "Imágenes (PNG, JPG, GIF, WebP)", Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.webp"},
		},
	})
	if err != nil || path == "" {
		return ""
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return "Error: no se pudo leer el archivo"
	}

	optimized, err := processImage(data, chatImageMaxDim, chatImageMaxBytes)
	if err != nil {
		return "Error: " + err.Error()
	}

	a.mu.Lock()
	currentUser := a.username
	sessions := make([]*PeerSession, 0, len(a.peers))
	for _, s := range a.peers {
		sessions = append(sessions, s)
	}
	a.mu.Unlock()

	if len(sessions) == 0 {
		return "Error: No hay ningún peer conectado actualmente"
	}

	b64 := base64.StdEncoding.EncodeToString(optimized)
	pkt := Packet{Type: "image", Sender: currentUser, Code: a.myCode, Image: b64}
	raw, err := json.Marshal(pkt)
	if err != nil {
		return "Error codificando imagen"
	}

	sent := 0
	for _, s := range sessions {
		if s.dc != nil && s.dc.ReadyState() == webrtc.DataChannelStateOpen {
			if err := s.dc.SendText(string(raw)); err == nil {
				sent++
			}
		}
	}

	if sent == 0 {
		return "Error: No se pudo enviar la imagen a los peers conectados"
	}

	// Guardar en el historial local y mostrarla en el propio chat
	a.saveMessageKind(currentUser, b64, "image", "")
	runtime.EventsEmit(a.ctx, "receive_message", Message{
		Sender: currentUser,
		Kind:   "image",
		Image:  "data:image/webp;base64," + b64,
	})
	return "Enviado"
}
