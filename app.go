package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const VERCEL_URL = "https://server-chat-vercel.vercel.app/api"

type Message struct {
	Sender string `json:"sender"`
	Text   string `json:"text"`
}

type NodeInfo struct {
	Code      string `json:"code"`
	MultiAddr string `json:"multiAddr"`
}

type App struct {
	ctx      context.Context
	username string
	myCode   string
	activePC *webrtc.PeerConnection
	activeDC *webrtc.DataChannel
	stopPoll chan struct{}
	mu       sync.Mutex
}

func NewApp() *App {
	return &App{
		username: "Anónimo",
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) SetUsername(name string) string {
	a.mu.Lock()
	defer a.mu.Unlock()
	if strings.TrimSpace(name) != "" {
		a.username = name
	}
	return a.username
}

func generateRoomCode() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = chars[int(b[i])%len(chars)]
	}
	return string(b)
}

func getRTCConfig() webrtc.Configuration {
	return webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: []string{
					"stun:stun.l.google.com:19302",
					"stun:stun1.l.google.com:19302",
					"stun:stun2.l.google.com:19302",
				},
			},
		},
	}
}

func (a *App) setupDataChannel(dc *webrtc.DataChannel) {
	a.mu.Lock()
	a.activeDC = dc
	a.mu.Unlock()

	dc.OnOpen(func() {
		runtime.EventsEmit(a.ctx, "peer_connected", "Canal de chat WebRTC conectado")
	})

	dc.OnMessage(func(msg webrtc.DataChannelMessage) {
		var chatMsg Message
		if err := json.Unmarshal(msg.Data, &chatMsg); err == nil {
			runtime.EventsEmit(a.ctx, "receive_message", chatMsg)
		}
	})

	dc.OnClose(func() {
		a.mu.Lock()
		if a.activeDC == dc {
			a.activeDC = nil
		}
		a.mu.Unlock()
	})
}

func (a *App) StartServer(port string) string {
	a.mu.Lock()
	if a.stopPoll != nil {
		close(a.stopPoll)
	}
	if a.activePC != nil {
		_ = a.activePC.Close()
	}
	a.stopPoll = make(chan struct{})
	a.myCode = generateRoomCode()
	stopChan := a.stopPoll
	code := a.myCode
	a.mu.Unlock()

	pc, err := webrtc.NewPeerConnection(getRTCConfig())
	if err != nil {
		return fmt.Sprintf("Error creando PeerConnection: %s", err.Error())
	}

	a.mu.Lock()
	a.activePC = pc
	a.mu.Unlock()

	dc, err := pc.CreateDataChannel("chat", nil)
	if err != nil {
		return fmt.Sprintf("Error creando canal de datos: %s", err.Error())
	}
	a.setupDataChannel(dc)

	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		if state == webrtc.ICEConnectionStateConnected {
			runtime.EventsEmit(a.ctx, "peer_connected", "Conexión WebRTC directa establecida")
		}
	})

	gatherComplete := webrtc.GatheringCompletePromise(pc)

	offer, err := pc.CreateOffer(nil)
	if err != nil {
		return fmt.Sprintf("Error creando oferta: %s", err.Error())
	}

	if err := pc.SetLocalDescription(offer); err != nil {
		return fmt.Sprintf("Error configurando oferta local: %s", err.Error())
	}

	// Esperar recolección de candidatos STUN de Google
	select {
	case <-gatherComplete:
	case <-time.After(5 * time.Second):
	}

	localOffer := pc.LocalDescription()
	offerBytes, err := json.Marshal(localOffer)
	if err != nil {
		return "Error codificando oferta local"
	}
	offerBase64 := base64.StdEncoding.EncodeToString(offerBytes)

	// Subir oferta a Vercel
	payload := map[string]string{
		"code":  code,
		"offer": offerBase64,
	}
	payloadBytes, _ := json.Marshal(payload)
	resp, err := http.Post(VERCEL_URL, "application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		return fmt.Sprintf("Error comunicando con Vercel: %s", err.Error())
	}
	_ = resp.Body.Close()

	// Iniciar sondeo en segundo plano para recibir el Answer del Guest
	go a.pollForAnswer(code, pc, stopChan)

	return fmt.Sprintf("Sala WebRTC creada. Tu código es: %s", code)
}

func (a *App) pollForAnswer(code string, pc *webrtc.PeerConnection, stopChan <-chan struct{}) {
	ticker := time.NewTicker(1500 * time.Millisecond)
	defer ticker.Stop()

	timeout := time.After(5 * time.Minute)

	for {
		select {
		case <-stopChan:
			return
		case <-timeout:
			return
		case <-ticker.C:
			if pc.ConnectionState() == webrtc.PeerConnectionStateConnected {
				return
			}

			resp, err := http.Get(fmt.Sprintf("%s?code=%s", VERCEL_URL, code))
			if err != nil {
				continue
			}

			body, err := io.ReadAll(resp.Body)
			_ = resp.Body.Close()
			if err != nil || resp.StatusCode != http.StatusOK {
				continue
			}

			var res struct {
				Answer string `json:"answer"`
			}
			if err := json.Unmarshal(body, &res); err == nil && res.Answer != "" {
				sdpBytes, err := base64.StdEncoding.DecodeString(res.Answer)
				if err != nil {
					continue
				}

				var answer webrtc.SessionDescription
				if err := json.Unmarshal(sdpBytes, &answer); err == nil {
					if pc.RemoteDescription() == nil {
						_ = pc.SetRemoteDescription(answer)
						return
					}
				}
			}
		}
	}
}

func (a *App) ConnectToPeer(input string) string {
	raw := strings.TrimSpace(input)
	code := raw

	if strings.Contains(code, "Código: ") {
		parts := strings.Split(code, "Código: ")
		if len(parts) > 1 {
			code = strings.TrimSpace(parts[1])
		}
	} else if len(code) > 6 && strings.Contains(code, "/p2p/") {
		parts := strings.Split(code, "/p2p/")
		if len(parts) > 1 {
			id := parts[len(parts)-1]
			if len(id) >= 6 {
				code = id[len(id)-6:]
			}
		}
	}

	code = strings.ToUpper(strings.TrimSpace(code))
	if len(code) != 6 {
		return fmt.Sprintf("Código inválido (%s). Debe tener 6 caracteres.", code)
	}

	// 1. Obtener la oferta desde Vercel
	resp, err := http.Get(fmt.Sprintf("%s?code=%s", VERCEL_URL, code))
	if err != nil {
		return fmt.Sprintf("Error conectando con Vercel: %s", err.Error())
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Sprintf("Código %s no encontrado o expirado en Vercel", code)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "Error leyendo respuesta de Vercel"
	}

	var res struct {
		Offer string `json:"offer"`
	}
	if err := json.Unmarshal(body, &res); err != nil || res.Offer == "" {
		return fmt.Sprintf("El código %s aún no tiene una oferta válida lista", code)
	}

	sdpBytes, err := base64.StdEncoding.DecodeString(res.Offer)
	if err != nil {
		return "Error decodificando oferta SDP"
	}

	var offer webrtc.SessionDescription
	if err := json.Unmarshal(sdpBytes, &offer); err != nil {
		return "Error procesando oferta SDP"
	}

	// 2. Crear PeerConnection del Guest
	pc, err := webrtc.NewPeerConnection(getRTCConfig())
	if err != nil {
		return fmt.Sprintf("Error creando WebRTC: %s", err.Error())
	}

	a.mu.Lock()
	if a.activePC != nil {
		_ = a.activePC.Close()
	}
	a.activePC = pc
	a.mu.Unlock()

	pc.OnDataChannel(func(dc *webrtc.DataChannel) {
		a.setupDataChannel(dc)
	})

	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		if state == webrtc.ICEConnectionStateConnected {
			runtime.EventsEmit(a.ctx, "peer_connected", "Conectado vía WebRTC P2P")
		}
	})

	if err := pc.SetRemoteDescription(offer); err != nil {
		return fmt.Sprintf("Error configurando oferta remota: %s", err.Error())
	}

	gatherComplete := webrtc.GatheringCompletePromise(pc)

	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		return fmt.Sprintf("Error generando respuesta WebRTC: %s", err.Error())
	}

	if err := pc.SetLocalDescription(answer); err != nil {
		return fmt.Sprintf("Error configurando respuesta local: %s", err.Error())
	}

	select {
	case <-gatherComplete:
	case <-time.After(5 * time.Second):
	}

	localAnswer := pc.LocalDescription()
	answerBytes, err := json.Marshal(localAnswer)
	if err != nil {
		return "Error codificando respuesta"
	}
	answerBase64 := base64.StdEncoding.EncodeToString(answerBytes)

	// 3. Enviar Answer a Vercel
	payload := map[string]string{
		"code":   code,
		"answer": answerBase64,
	}
	payloadBytes, _ := json.Marshal(payload)
	postResp, err := http.Post(VERCEL_URL, "application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		return fmt.Sprintf("Error enviando respuesta a Vercel: %s", err.Error())
	}
	_ = postResp.Body.Close()

	return fmt.Sprintf("Respuesta enviada a %s. Conectando P2P vía Google STUN...", code)
}

func (a *App) SendMessage(text string) string {
	a.mu.Lock()
	dc := a.activeDC
	currentUser := a.username
	a.mu.Unlock()

	if dc == nil || dc.ReadyState() != webrtc.DataChannelStateOpen {
		return "Error: No estás conectado a ningún peer actualmente"
	}

	msg := Message{
		Sender: currentUser,
		Text:   text,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return "Error codificando mensaje"
	}

	if err := dc.SendText(string(data)); err != nil {
		return fmt.Sprintf("Error enviando mensaje: %s", err.Error())
	}

	// Emitir también localmente para que el remitente vea su mensaje en la lista
	runtime.EventsEmit(a.ctx, "receive_message", msg)

	return "Enviado"
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
