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
}

type Packet struct {
	Type   string `json:"type"` // "text", "audio", "hello" o "avatar"
	Sender string `json:"sender"`
	Text   string `json:"text,omitempty"`
	Audio  string `json:"audio,omitempty"`  // base64 encoded PCM chunk
	Code   string `json:"code,omitempty"`   // código fijo del equipo emisor
	Avatar string `json:"avatar,omitempty"` // base64 del WebP (estático o animado)
}

// PeerInfo guarda lo que sabemos de cada peer (por su código fijo)
type PeerInfo struct {
	Name   string
	Avatar string // data URL lista para <img>
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
	ctx      context.Context
	username string
	myCode   string
	myPort   string
	peers    map[string]*PeerSession
	peerInfo map[string]PeerInfo
	stopPoll chan struct{}
	db       *sql.DB
	mu       sync.Mutex
}

func NewApp() *App {
	return &App{
		username: "Anónimo",
		peers:    make(map[string]*PeerSession),
		peerInfo: make(map[string]PeerInfo),
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

// GetUsers devuelve la lista de usuarios: tú primero, luego los peers
// conectados (activos) y al final los conocidos de SQLite (inactivos)
func (a *App) GetUsers() []UserEntry {
	a.mu.Lock()
	own := a.username
	infos := make(map[string]PeerInfo, len(a.peerInfo))
	for k, v := range a.peerInfo {
		infos[k] = v
	}
	peerCodes := make([]string, 0, len(a.peers))
	for code := range a.peers {
		peerCodes = append(peerCodes, code)
	}
	a.mu.Unlock()

	users := []UserEntry{{Name: own, Online: true, Avatar: a.avatarDataURL(), Self: true}}
	seen := map[string]bool{own: true}

	for _, code := range peerCodes {
		info := infos[code]
		name := info.Name
		if name == "" {
			name = "Peer " + code
		}
		if seen[name] {
			continue
		}
		seen[name] = true
		users = append(users, UserEntry{Name: name, Online: true, Avatar: info.Avatar})
	}

	if a.db != nil {
		rows, err := a.db.Query(`SELECT nombre FROM usuario`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var n string
				if rows.Scan(&n) == nil && n != "" && !seen[n] {
					seen[n] = true
					users = append(users, UserEntry{Name: n, Online: false})
				}
			}
		}
	}

	return users
}
