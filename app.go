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
	Type   string `json:"type"` // "text" or "audio"
	Sender string `json:"sender"`
	Text   string `json:"text,omitempty"`
	Audio  string `json:"audio,omitempty"` // base64 encoded PCM chunk
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
	stopPoll chan struct{}
	db       *sql.DB
	mu       sync.Mutex
}

func NewApp() *App {
	return &App{
		username: "Anónimo",
		peers:    make(map[string]*PeerSession),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if err := a.initDB(); err != nil {
		fmt.Println("Error inicializando base de datos SQLite:", err)
	}
}

func (a *App) SetUsername(name string) string {
	a.mu.Lock()
	defer a.mu.Unlock()
	if strings.TrimSpace(name) != "" {
		a.username = name
	}
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
