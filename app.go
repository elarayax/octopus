package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/pion/webrtc/v4"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const VERCEL_URL = "https://server-chat-vercel.vercel.app/api"

type Message struct {
	Sender string `json:"sender"`
	Text   string `json:"text"`
	Kind   string `json:"kind"`           // "text" o "image"
	Image  string `json:"image,omitempty"` // data URL (solo kind=image)
	Time   string `json:"time,omitempty"`
}

type Packet struct {
	Type    string `json:"type"` // "text", "audio", "hello", "avatar", "bye", "image", "history_req", "history", "roster", "channel"
	Sender  string `json:"sender"`
	Text    string `json:"text,omitempty"`
	Audio   string `json:"audio,omitempty"`   // base64 encoded PCM chunk
	Code    string `json:"code,omitempty"`    // código fijo del equipo emisor
	Avatar  string `json:"avatar,omitempty"`  // base64 del WebP (estático o animado)
	Image   string `json:"image,omitempty"`   // base64 del WebP de chat
	History string `json:"history,omitempty"` // JSON con mensajes para sincronizar
	Online  bool   `json:"online,omitempty"`  // roster: si el miembro está activo
	Channel string `json:"channel,omitempty"` // JSON con ChannelInfo (solo el host)
}

// ChannelInfo es la identidad del canal que muestra el header
type ChannelInfo struct {
	Nombre    string `json:"nombre"`
	Subtitulo string `json:"subtitulo"`
	Icono     string `json:"icono"`
}

// UserEntry es una fila de la lista de usuarios para la UI
type UserEntry struct {
	Name   string `json:"name"`
	Online bool   `json:"online"`
	Avatar string `json:"avatar"`
	Self   bool   `json:"self"`
}

type NodeInfo struct {
	Code      string `json:"code"`
	MultiAddr string `json:"multiAddr"`
}

type App struct {
	ctx       context.Context
	username  string
	myCode    string
	myPort    string
	isHost    bool
	peers     map[string]*PeerSession
	onlineSet map[string]bool // presencia por código (directorio vive en SQLite)
	stopPoll  chan struct{}
	db        *sql.DB
	mu        sync.Mutex
}

func NewApp() *App {
	return &App{
		username:  "Anónimo",
		peers:     make(map[string]*PeerSession),
		onlineSet: make(map[string]bool),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if err := a.initDB(); err != nil {
		fmt.Println("Error inicializando base de datos SQLite:", err)
		return
	}
	// Restaurar el nombre de usuario guardado de la sesión anterior
	if saved := a.getSetting("username"); strings.TrimSpace(saved) != "" {
		a.username = saved
		fmt.Println("Nombre de usuario restaurado:", a.username)
	}
	// Restaurar la identidad del canal (título de la ventana)
	if info := a.GetChannelInfo(); info.Nombre != "" {
		runtime.WindowSetTitle(a.ctx, info.Nombre)
	}
}

func (a *App) SetUsername(name string) string {
	a.mu.Lock()
	a.username = strings.TrimSpace(name)
	if a.username == "" {
		a.username = "Anónimo"
	}
	username := a.username
	a.mu.Unlock()

	// Persistir en SQLite para restaurarlo al iniciar el programa
	a.saveSetting("username", username)
	// Avisar a los peers conectados del nuevo nombre
	a.broadcastHello()
	return username
}

func (a *App) GetUsername() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.username
}

func (a *App) SendMessage(text string) string {
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

	pkt := Packet{
		Type:   "text",
		Sender: currentUser,
		Text:   text,
		Code:   a.myCode,
	}

	data, err := json.Marshal(pkt)
	if err != nil {
		return "Error codificando mensaje"
	}

	sent := 0
	for _, s := range sessions {
		if s.dc != nil && s.dc.ReadyState() == webrtc.DataChannelStateOpen {
			if err := s.dc.SendText(string(data)); err == nil {
				sent++
			}
		}
	}

	if sent > 0 {
		a.saveMessage(currentUser, text)
		runtime.EventsEmit(a.ctx, "receive_message", Message{Sender: currentUser, Text: text})
		return "Enviado"
	}

	return "Error: No se pudo enviar el mensaje a los peers conectados"
}

func (a *App) GetMyCode() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.myCode
}

func (a *App) GetNodeInfo() NodeInfo {
	a.mu.Lock()
	defer a.mu.Unlock()
	return NodeInfo{
		Code:      a.myCode,
		MultiAddr: a.myCode,
	}
}

// GetUsers devuelve la lista de usuarios: tú primero, luego los miembros del
// canal (directorio persistente en SQLite): activos primero, inactivos después
func (a *App) GetUsers() []UserEntry {
	a.mu.Lock()
	own := a.username
	ownCode := a.myCode
	online := make(map[string]bool, len(a.onlineSet))
	for k, v := range a.onlineSet {
		online[k] = v
	}
	a.mu.Unlock()

	users := []UserEntry{{Name: own, Online: true, Avatar: a.avatarDataURL(), Self: true}}

	var activos, inactivos []UserEntry
	for _, m := range a.getMiembros() {
		if m.Codigo == ownCode || m.Nombre == own {
			continue
		}
		avatar := ""
		if m.Avatar != "" {
			avatar = "data:image/webp;base64," + m.Avatar
		}
		entry := UserEntry{Name: m.Nombre, Online: online[m.Codigo], Avatar: avatar}
		if entry.Online {
			activos = append(activos, entry)
		} else {
			inactivos = append(inactivos, entry)
		}
	}

	// Conocidos de mensajes antiguos que no están en el directorio
	seen := map[string]bool{own: true}
	for _, u := range activos {
		seen[u.Name] = true
	}
	for _, u := range inactivos {
		seen[u.Name] = true
	}
	if a.db != nil {
		rows, err := a.db.Query(`SELECT nombre FROM usuario`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var n string
				if rows.Scan(&n) == nil && n != "" && !seen[n] {
					seen[n] = true
					inactivos = append(inactivos, UserEntry{Name: n, Online: false})
				}
			}
		}
	}

	return append(users, append(activos, inactivos...)...)
}

// GetChannelInfo devuelve la identidad del canal (persistida en SQLite)
func (a *App) GetChannelInfo() ChannelInfo {
	info := ChannelInfo{Nombre: "Chat P2P", Subtitulo: "Texto & Voz en Vivo", Icono: "🐙"}
	if raw := a.getSetting("canal_info"); raw != "" {
		_ = json.Unmarshal([]byte(raw), &info)
	}
	return info
}

// SetChannelInfo guarda la identidad del canal, la aplica al título y la
// comparte con los peers (si somos host)
func (a *App) SetChannelInfo(nombre, subtitulo, icono string) ChannelInfo {
	info := a.GetChannelInfo()
	if v := strings.TrimSpace(nombre); v != "" {
		info.Nombre = v
	}
	if subtitulo != "" || nombre != "" {
		info.Subtitulo = strings.TrimSpace(subtitulo)
	}
	if v := strings.TrimSpace(icono); v != "" {
		info.Icono = v
	}
	if raw, err := json.Marshal(info); err == nil {
		a.saveSetting("canal_info", string(raw))
	}
	a.mu.Lock()
	isHost := a.isHost
	a.mu.Unlock()
	runtime.WindowSetTitle(a.ctx, info.Nombre)
	runtime.EventsEmit(a.ctx, "channel_info", info)
	if isHost {
		a.broadcastChannelInfo(info)
	}
	return info
}
