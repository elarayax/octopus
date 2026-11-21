package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/pion/webrtc/v4"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// broadcastPacket envía un paquete por el canal de chat a todos los peers directos
func (a *App) broadcastPacket(pkt Packet) int {
	raw, err := json.Marshal(pkt)
	if err != nil {
		return 0
	}
	a.mu.Lock()
	sessions := make([]*PeerSession, 0, len(a.peers))
	for _, s := range a.peers {
		sessions = append(sessions, s)
	}
	a.mu.Unlock()

	sent := 0
	for _, s := range sessions {
		if s.dc != nil && s.dc.ReadyState() == webrtc.DataChannelStateOpen {
			if s.dc.SendText(string(raw)) == nil {
				sent++
			}
		}
	}
	return sent
}

// ---------- Reacciones ----------

// ReactToMessage pone o quita (toggle) mi reacción a un mensaje y avisa a los peers
func (a *App) ReactToMessage(msgID, emoji string) string {
	if msgID == "" || emoji == "" || len(emoji) > 32 {
		return "Error: reacción inválida"
	}
	a.mu.Lock()
	me := a.username
	code := a.myCode
	a.mu.Unlock()

	add := !a.hasReaction(msgID, me, emoji)
	a.applyReaction(msgID, me, emoji, add)
	a.broadcastPacket(Packet{Type: "reaction", Sender: me, Code: code, MsgID: msgID, Emoji: emoji, Add: add})
	return "OK"
}

// applyReaction guarda la reacción (propia o recibida) y avisa a la UI
func (a *App) applyReaction(msgID, user, emoji string, add bool) {
	if msgID == "" || user == "" || emoji == "" || len(emoji) > 32 {
		return
	}
	a.setReaction(msgID, user, emoji, add)
	runtime.EventsEmit(a.ctx, "reaction", msgID, emoji, user, add)
}

// ---------- Estado de la llamada de voz ----------

// SetCallState anuncia a los peers si estoy dentro de la llamada de voz
func (a *App) SetCallState(inCall bool) string {
	a.mu.Lock()
	a.inCall = inCall
	me := a.username
	code := a.myCode
	a.mu.Unlock()
	a.broadcastPacket(Packet{Type: "call", Sender: me, Code: code, Online: inCall})
	return "OK"
}

// sendCallStateTo informa a un peer recién conectado de si estoy en la llamada
func (a *App) sendCallStateTo(dc *webrtc.DataChannel) {
	a.mu.Lock()
	pkt := Packet{Type: "call", Sender: a.username, Code: a.myCode, Online: a.inCall}
	a.mu.Unlock()
	if raw, err := json.Marshal(pkt); err == nil {
		_ = dc.SendText(string(raw))
	}
}

// ---------- Sin leer y notificaciones ----------

// SetUnread fija el contador de sin leer y lo refleja en el título: "(3) Canal"
func (a *App) SetUnread(n int) {
	if n < 0 {
		n = 0
	}
	a.mu.Lock()
	a.unread = n
	a.mu.Unlock()
	a.setTitle(a.GetChannelInfo().Nombre)
}

// setTitle aplica el título de la ventana con el prefijo de sin leer
func (a *App) setTitle(name string) {
	a.mu.Lock()
	n := a.unread
	a.mu.Unlock()
	if n > 0 {
		name = fmt.Sprintf("(%d) %s", n, name)
	}
	runtime.WindowSetTitle(a.ctx, name)
}

// NotifyDesktop muestra una notificación del sistema (la UI decide cuándo)
func (a *App) NotifyDesktop(title, body string) string {
	if !a.notifyReady {
		return "Notificaciones no disponibles"
	}
	err := runtime.SendNotification(a.ctx, runtime.NotificationOptions{
		ID:    fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Title: title,
		Body:  body,
	})
	if err != nil {
		return "Error: " + err.Error()
	}
	return "OK"
}

// initNotifications prepara las notificaciones nativas (Wails v2.10+)
func (a *App) initNotifications() {
	if err := runtime.InitializeNotifications(a.ctx); err != nil {
		return
	}
	if !runtime.IsNotificationAvailable(a.ctx) {
		return
	}
	if ok, err := runtime.RequestNotificationAuthorization(a.ctx); err != nil || !ok {
		return
	}
	a.notifyReady = true
}
