package main

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pion/webrtc/v4"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type PeerSession struct {
	id  string
	pc  *webrtc.PeerConnection
	dc  *webrtc.DataChannel // texto: fiable y ordenado
	dca *webrtc.DataChannel // audio: no fiable, sin orden (baja latencia)
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

// codeFromKey deriva un código de 6 caracteres del hash de la identidad
func codeFromKey(keyData []byte) string {
	h := sha256.Sum256(keyData)
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	var sb strings.Builder
	for i := 0; i < 6; i++ {
		sb.WriteByte(chars[int(h[i])%len(chars)])
	}
	return sb.String()
}

func persistCode(codePath, code string) string {
	_ = os.WriteFile(codePath, []byte(code), 0600)
	return code
}

// getOrCreateFixedCode devuelve el código fijo del equipo (por usuario del SO).
// Es estable: NO cambia aunque cambie el puerto, la red o el nombre de usuario.
func getOrCreateFixedCode() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return generateRoomCode()
	}

	configDir := filepath.Join(homeDir, ".chat_p2p")
	_ = os.MkdirAll(configDir, 0700)

	codePath := filepath.Join(configDir, "fixed_code.txt")
	keyPath := filepath.Join(configDir, "identity.key")

	// 1. Ya existe un código global para este equipo
	if data, err := os.ReadFile(codePath); err == nil {
		if code := strings.ToUpper(strings.TrimSpace(string(data))); len(code) == 6 {
			return code
		}
	}

	// 2. Migración: adoptar el código viejo por-puerto que los amigos ya
	//    conocen (fixed_code_*.txt, en orden: 8080 primero)
	if matches, _ := filepath.Glob(filepath.Join(configDir, "fixed_code_*.txt")); len(matches) > 0 {
		for _, m := range matches {
			if data, err := os.ReadFile(m); err == nil {
				if code := strings.ToUpper(strings.TrimSpace(string(data))); len(code) == 6 {
					return persistCode(codePath, code)
				}
			}
		}
	}

	// 3. Existe identidad global: derivar el código de ella (determinista)
	if keyData, err := os.ReadFile(keyPath); err == nil && len(keyData) > 0 {
		return persistCode(codePath, codeFromKey(keyData))
	}

	// 4. Migración de identidades antiguas por-puerto
	if matches, _ := filepath.Glob(filepath.Join(configDir, "identity_*.key")); len(matches) > 0 {
		for _, m := range matches {
			if keyData, err := os.ReadFile(m); err == nil && len(keyData) > 0 {
				// Conservar la identidad como la nueva global
				_ = os.WriteFile(keyPath, keyData, 0600)
				return persistCode(codePath, codeFromKey(keyData))
			}
		}
	}

	// 5. Primera vez en este equipo: crear identidad nueva y derivar el código
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return persistCode(codePath, generateRoomCode())
	}
	_ = os.WriteFile(keyPath, key, 0600)
	return persistCode(codePath, codeFromKey(key))
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

func (a *App) StartServer(port string) string {
	a.mu.Lock()
	if a.stopPoll != nil {
		close(a.stopPoll)
	}
	a.stopPoll = make(chan struct{})
	stopChan := a.stopPoll
	a.myPort = port
	a.myCode = getOrCreateFixedCode()
	code := a.myCode
	a.mu.Unlock()

	go a.pollMailbox(stopChan)

	return fmt.Sprintf("Servidor activo con ID Fijo: %s", code)
}

func (a *App) pollMailbox(stopChan <-chan struct{}) {
	ticker := time.NewTicker(1500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-stopChan:
			return
		case <-ticker.C:
			a.mu.Lock()
			code := a.myCode
			a.mu.Unlock()

			if code == "" {
				continue
			}

			resp, err := http.Get(fmt.Sprintf("%s?for=%s", VERCEL_URL, code))
			if err != nil {
				continue
			}

			body, err := io.ReadAll(resp.Body)
			_ = resp.Body.Close()
			if err != nil || resp.StatusCode != http.StatusOK {
				continue
			}

			var res struct {
				Messages []struct {
					From string `json:"from"`
					Type string `json:"type"`
					SDP  string `json:"sdp"`
				} `json:"messages"`
			}
			if err := json.Unmarshal(body, &res); err != nil {
				continue
			}

			for _, m := range res.Messages {
				if m.Type == "offer" {
					go a.handleIncomingOffer(m.From, m.SDP)
				} else if m.Type == "answer" {
					go a.handleIncomingAnswer(m.From, m.SDP)
				}
			}
		}
	}
}

func (a *App) setupDataChannel(remoteID string, dc *webrtc.DataChannel) {
	isChat := dc.Label() == "chat"

	dc.OnOpen(func() {
		if isChat {
			runtime.EventsEmit(a.ctx, "peer_connected", fmt.Sprintf("Peer %s conectado", remoteID))
		}
	})

	dc.OnMessage(func(msg webrtc.DataChannelMessage) {
		var pkt Packet
		if err := json.Unmarshal(msg.Data, &pkt); err == nil {
			if pkt.Type == "audio" {
				runtime.EventsEmit(a.ctx, "receive_audio", pkt.Audio)
			} else {
				chatMsg := Message{
					Sender: pkt.Sender,
					Text:   pkt.Text,
				}
				a.saveMessage(pkt.Sender, pkt.Text)
				runtime.EventsEmit(a.ctx, "receive_message", chatMsg)
			}

			// Retransmitir a los demás peers por el canal adecuado
			a.mu.Lock()
			for id, session := range a.peers {
				if id == remoteID {
					continue
				}
				ch := session.dc
				if pkt.Type == "audio" && session.dca != nil && session.dca.ReadyState() == webrtc.DataChannelStateOpen {
					ch = session.dca
				}
				if ch != nil && ch.ReadyState() == webrtc.DataChannelStateOpen {
					_ = ch.SendText(string(msg.Data))
				}
			}
			a.mu.Unlock()
		}
	})

	dc.OnClose(func() {
		if isChat {
			a.removePeer(remoteID)
			runtime.EventsEmit(a.ctx, "peer_disconnected", remoteID)
		}
	})
}

func (a *App) handleIncomingOffer(fromPeerID, offerB64 string) {
	sdpBytes, err := base64.StdEncoding.DecodeString(offerB64)
	if err != nil {
		return
	}
	var offer webrtc.SessionDescription
	if err := json.Unmarshal(sdpBytes, &offer); err != nil {
		return
	}

	pc, err := webrtc.NewPeerConnection(getRTCConfig())
	if err != nil {
		return
	}

	session := &PeerSession{
		id: fromPeerID,
		pc: pc,
	}

	a.mu.Lock()
	if old, exists := a.peers[fromPeerID]; exists {
		if old.pc != nil {
			_ = old.pc.Close()
		}
	}
	a.peers[fromPeerID] = session
	a.mu.Unlock()

	pc.OnDataChannel(func(dc *webrtc.DataChannel) {
		if dc.Label() == "audio" {
			session.dca = dc
		} else {
			session.dc = dc
		}
		a.setupDataChannel(fromPeerID, dc)
	})

	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		if state == webrtc.ICEConnectionStateConnected {
			runtime.EventsEmit(a.ctx, "peer_connected", fmt.Sprintf("Peer %s conectado vía WebRTC", fromPeerID))
		} else if state == webrtc.ICEConnectionStateDisconnected || state == webrtc.ICEConnectionStateFailed || state == webrtc.ICEConnectionStateClosed {
			a.removePeer(fromPeerID)
			runtime.EventsEmit(a.ctx, "peer_disconnected", fromPeerID)
		}
	})

	if err := pc.SetRemoteDescription(offer); err != nil {
		return
	}

	gatherComplete := webrtc.GatheringCompletePromise(pc)

	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		return
	}

	if err := pc.SetLocalDescription(answer); err != nil {
		return
	}

	select {
	case <-gatherComplete:
	case <-time.After(5 * time.Second):
	}

	localAnswer := pc.LocalDescription()
	answerBytes, err := json.Marshal(localAnswer)
	if err != nil {
		return
	}
	answerB64 := base64.StdEncoding.EncodeToString(answerBytes)

	_ = a.sendSignal(fromPeerID, "answer", answerB64)
}

func (a *App) handleIncomingAnswer(fromPeerID, answerB64 string) {
	sdpBytes, err := base64.StdEncoding.DecodeString(answerB64)
	if err != nil {
		return
	}
	var answer webrtc.SessionDescription
	if err := json.Unmarshal(sdpBytes, &answer); err != nil {
		return
	}

	a.mu.Lock()
	session, exists := a.peers[fromPeerID]
	a.mu.Unlock()

	if exists && session.pc != nil && session.pc.RemoteDescription() == nil {
		_ = session.pc.SetRemoteDescription(answer)
	}
}

func (a *App) sendSignal(to, sigType, sdp string) error {
	a.mu.Lock()
	from := a.myCode
	a.mu.Unlock()

	payload := map[string]string{
		"to":   to,
		"from": from,
		"type": sigType,
		"sdp":  sdp,
	}
	data, _ := json.Marshal(payload)
	resp, err := http.Post(VERCEL_URL, "application/json", bytes.NewBuffer(data))
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	return nil
}

func (a *App) removePeer(id string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if s, exists := a.peers[id]; exists {
		if s.pc != nil {
			_ = s.pc.Close()
		}
		delete(a.peers, id)
	}
}

func (a *App) ConnectToPeer(input string) string {
	raw := strings.TrimSpace(input)
	target := raw

	if strings.Contains(target, "Código: ") {
		parts := strings.Split(target, "Código: ")
		if len(parts) > 1 {
			target = strings.TrimSpace(parts[1])
		}
	} else if len(target) > 6 && strings.Contains(target, "/p2p/") {
		parts := strings.Split(target, "/p2p/")
		if len(parts) > 1 {
			id := parts[len(parts)-1]
			if len(id) >= 6 {
				target = id[len(id)-6:]
			}
		}
	}

	target = strings.ToUpper(strings.TrimSpace(target))
	if len(target) != 6 {
		return fmt.Sprintf("Código inválido (%s). Debe tener 6 caracteres.", target)
	}

	a.mu.Lock()
	myCode := a.myCode
	a.mu.Unlock()

	if myCode == "" {
		return "Debes iniciar el servidor primero para activar tu ID fijo."
	}

	if target == myCode {
		return "No puedes conectarte a tu propio código."
	}

	pc, err := webrtc.NewPeerConnection(getRTCConfig())
	if err != nil {
		return fmt.Sprintf("Error creando WebRTC: %s", err.Error())
	}

	session := &PeerSession{
		id: target,
		pc: pc,
	}

	dc, err := pc.CreateDataChannel("chat", nil)
	if err != nil {
		_ = pc.Close()
		return fmt.Sprintf("Error creando canal de datos: %s", err.Error())
	}
	session.dc = dc

	// Canal de audio: no fiable y sin orden (maxRetransmits=0).
	// Para voz en vivo es mejor perder un paquete que esperar su retransmisión.
	maxRetransmits := uint16(0)
	unordered := false
	dca, err := pc.CreateDataChannel("audio", &webrtc.DataChannelInit{
		MaxRetransmits: &maxRetransmits,
		Ordered:        &unordered,
	})
	if err != nil {
		_ = pc.Close()
		return fmt.Sprintf("Error creando canal de audio: %s", err.Error())
	}
	session.dca = dca

	a.mu.Lock()
	if old, exists := a.peers[target]; exists {
		if old.pc != nil {
			_ = old.pc.Close()
		}
	}
	a.peers[target] = session
	a.mu.Unlock()

	a.setupDataChannel(target, dc)
	a.setupDataChannel(target, dca)

	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		if state == webrtc.ICEConnectionStateConnected {
			runtime.EventsEmit(a.ctx, "peer_connected", fmt.Sprintf("Peer %s conectado vía WebRTC", target))
		} else if state == webrtc.ICEConnectionStateDisconnected || state == webrtc.ICEConnectionStateFailed || state == webrtc.ICEConnectionStateClosed {
			a.removePeer(target)
			runtime.EventsEmit(a.ctx, "peer_disconnected", target)
		}
	})

	gatherComplete := webrtc.GatheringCompletePromise(pc)

	offer, err := pc.CreateOffer(nil)
	if err != nil {
		return fmt.Sprintf("Error creando oferta: %s", err.Error())
	}

	if err := pc.SetLocalDescription(offer); err != nil {
		return fmt.Sprintf("Error configurando oferta: %s", err.Error())
	}

	select {
	case <-gatherComplete:
	case <-time.After(5 * time.Second):
	}

	localOffer := pc.LocalDescription()
	offerBytes, err := json.Marshal(localOffer)
	if err != nil {
		return "Error codificando oferta"
	}
	offerB64 := base64.StdEncoding.EncodeToString(offerBytes)

	if err := a.sendSignal(target, "offer", offerB64); err != nil {
		return fmt.Sprintf("Error enviando solicitud a Vercel: %s", err.Error())
	}

	return fmt.Sprintf("Solicitud enviada a %s. Conectando P2P...", target)
}
