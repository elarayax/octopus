package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/libp2p/go-libp2p"
	pubsub "github.com/libp2p/go-libp2p-pubsub"
	"github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/p2p/discovery/mdns"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Asegúrate de incluir /api al final si colocaste tu index.js en la carpeta api/
const VERCEL_URL = "https://server-chat-vercel.vercel.app/api"

type Message struct {
	Sender string `json:"sender"`
	Text   string `json:"text"`
}

type discoveryNotifer struct {
	h host.Host
}

func (n *discoveryNotifer) HandlePeerFound(pi peer.AddrInfo) {
	_ = n.h.Connect(context.Background(), pi)
}

type App struct {
	ctx      context.Context
	username string
	host     host.Host
	ps       *pubsub.PubSub
	topic    *pubsub.Topic
	sub      *pubsub.Subscription
	myCode   string
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

func getOrCreateIdentity(port string) (crypto.PrivKey, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	configDir := filepath.Join(homeDir, ".chat_p2p")
	_ = os.MkdirAll(configDir, 0700)

	keyFilename := fmt.Sprintf("identity_%s.key", port)
	keyPath := filepath.Join(configDir, keyFilename)

	if data, err := os.ReadFile(keyPath); err == nil {
		return crypto.UnmarshalPrivateKey(data)
	}

	priv, _, err := crypto.GenerateKeyPairWithReader(crypto.RSA, 2048, rand.Reader)
	if err != nil {
		return nil, err
	}

	data, err := crypto.MarshalPrivateKey(priv)
	if err != nil {
		return nil, err
	}

	_ = os.WriteFile(keyPath, data, 0600)
	return priv, nil
}

func (a *App) StartServer(port string) string {
	var err error

	// 1. Cargar o crear identidad asociada al puerto local
	privKey, err := getOrCreateIdentity(port)
	if err != nil {
		return fmt.Sprintf("Error cargando identidad: %s", err.Error())
	}

	// 2. Iniciar Host libp2p
	listenAddr := fmt.Sprintf("/ip4/0.0.0.0/tcp/%s", port)
	a.host, err = libp2p.New(
		libp2p.Identity(privKey),
		libp2p.ListenAddrStrings(listenAddr),
	)
	if err != nil {
		return fmt.Sprintf("Error iniciando libp2p: %s", err.Error())
	}

	// 3. Generar Código Único de 6 caracteres
	peerIDStr := a.host.ID().String()
	a.myCode = strings.ToUpper(peerIDStr[len(peerIDStr)-6:])

	// 4. Inicializar GossipSub
	a.ps, err = pubsub.NewGossipSub(a.ctx, a.host)
	if err != nil {
		return fmt.Sprintf("Error iniciando GossipSub: %s", err.Error())
	}

	a.topic, err = a.ps.Join("chat-general")
	if err != nil {
		return fmt.Sprintf("Error uniendo al canal: %s", err.Error())
	}

	a.sub, err = a.topic.Subscribe()
	if err != nil {
		return fmt.Sprintf("Error suscribiendo: %s", err.Error())
	}

	// 5. Descubrimiento local mDNS
	ser := mdns.NewMdnsService(a.host, "p2p-chat-mdns", &discoveryNotifer{h: a.host})
	_ = ser.Start()

	// 6. Registrar en Vercel de inmediato y mantener registro activo cada 30 segundos
	go func() {
		a.RegisterInVercel()
		ticker := time.NewTicker(30 * time.Second)
		for range ticker.C {
			a.RegisterInVercel()
		}
	}()

	go a.listenLoop()

	return fmt.Sprintf("Nodo Activo en puerto %s. ID: %s", port, a.myCode)
}

// Devuelve la Multiaddr del equipo omitiendo direcciones loopback (127.0.0.1)
func (a *App) getMultiAddr() string {
	if a.host == nil {
		return ""
	}

	peerID := a.host.ID().String()

	// Busca la IP privada real (ej: 192.168.x.x o 10.x.x.x)
	for _, addr := range a.host.Addrs() {
		addrStr := addr.String()
		if !strings.Contains(addrStr, "127.0.0.1") && strings.Contains(addrStr, "/ip4/") {
			return fmt.Sprintf("%s/p2p/%s", addrStr, peerID)
		}
	}

	// Si no encuentra una IP distinta, retorna la primera
	addrs := a.host.Addrs()
	if len(addrs) > 0 {
		return fmt.Sprintf("%s/p2p/%s", addrs[0].String(), peerID)
	}
	return ""
}

func (a *App) GetMyCode() string {
	return a.myCode
}

func (a *App) ConnectToPeer(input string) string {
	if a.host == nil {
		return "Debes iniciar el servidor primero"
	}

	target := strings.TrimSpace(input)

	// Si el usuario ingresa un código de 6 caracteres
	if len(target) == 6 && !strings.HasPrefix(target, "/ip4/") {
		resolvedAddr := a.ResolveCodeInVercel(target)
		if resolvedAddr == "" {
			return fmt.Sprintf("No se encontró ninguna dirección asociada al código %s en Vercel", target)
		}
		target = resolvedAddr
	}

	info, err := peer.AddrInfoFromString(target)
	if err != nil {
		return fmt.Sprintf("Dirección inválida: %s", err.Error())
	}

	if err := a.host.Connect(a.ctx, *info); err != nil {
		return fmt.Sprintf("Error conectando con peer: %s", err.Error())
	}

	return fmt.Sprintf("Conectado exitosamente con %s", info.ID.String()[:8])
}

func (a *App) SendMessage(text string) string {
	if a.topic == nil {
		return "Error: No estás conectado a ningún canal"
	}

	a.mu.Lock()
	currentUser := a.username
	a.mu.Unlock()

	msg := Message{
		Sender: currentUser,
		Text:   text,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return "Error codificando mensaje"
	}

	if err := a.topic.Publish(a.ctx, data); err != nil {
		return fmt.Sprintf("Error publicando: %s", err.Error())
	}

	return "Enviado"
}

func (a *App) listenLoop() {
	for {
		msg, err := a.sub.Next(a.ctx)
		if err != nil {
			return
		}

		var chatMsg Message
		if err := json.Unmarshal(msg.Data, &chatMsg); err == nil {
			runtime.EventsEmit(a.ctx, "receive_message", chatMsg)
		}
	}
}

type NodeInfo struct {
	Code      string `json:"code"`
	MultiAddr string `json:"multiAddr"`
}

func (a *App) GetNodeInfo() NodeInfo {
	a.mu.Lock()
	defer a.mu.Unlock()
	return NodeInfo{
		Code:      a.myCode,
		MultiAddr: a.getMultiAddr(),
	}
}

func (a *App) RegisterInVercel() {
	if a.myCode == "" {
		return
	}

	payload := map[string]string{
		"code":      a.myCode,
		"multiAddr": a.getMultiAddr(),
	}

	jsonData, _ := json.Marshal(payload)
	resp, err := http.Post(VERCEL_URL, "application/json", bytes.NewBuffer(jsonData))
	if err == nil && resp != nil {
		_ = resp.Body.Close()
	}
}

func (a *App) ResolveCodeInVercel(code string) string {
	resp, err := http.Get(fmt.Sprintf("%s?code=%s", VERCEL_URL, strings.ToUpper(code)))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ""
	}

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		MultiAddr string `json:"multiAddr"`
	}
	_ = json.Unmarshal(body, &result)

	return result.MultiAddr
}
