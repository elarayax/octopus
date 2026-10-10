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

const VERCEL_URL = "https://server-chat-vercel.vercel.app/api"

// Nodos Bootstrap públicos globales de IPFS/libp2p para descubrimiento en Internet
var BOOTSTRAP_PEERS = []string{
	"/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bf3Jw2392QJ5jL2522M993P49gQb8M24B8R38",
	"/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSBvM73kWWAj66RPhnczX8b563A2U32C2L6",
	"/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDM1awE2225g73KND5y4v4nTEX369nf72553x5Kx8z",
}

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

	privKey, err := getOrCreateIdentity(port)
	if err != nil {
		return fmt.Sprintf("Error cargando identidad: %s", err.Error())
	}

	listenAddr := fmt.Sprintf("/ip4/0.0.0.0/tcp/%s", port)
	a.host, err = libp2p.New(
		libp2p.Identity(privKey),
		libp2p.ListenAddrStrings(listenAddr),
		libp2p.EnableNATService(),
		libp2p.EnableRelayService(),
		libp2p.EnableHolePunching(),
		libp2p.NATPortMap(),
	)
	if err != nil {
		return fmt.Sprintf("Error iniciando libp2p: %s", err.Error())
	}

	peerIDStr := a.host.ID().String()
	a.myCode = strings.ToUpper(peerIDStr[len(peerIDStr)-6:])

	// Conectar a nodos Bootstrap públicos para estar en la red global
	go a.connectToBootstrapPeers()

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

	ser := mdns.NewMdnsService(a.host, "p2p-chat-mdns", &discoveryNotifer{h: a.host})
	_ = ser.Start()

	go func() {
		// Esperar 3 segundos para que libp2p resuelva direcciones públicas
		time.Sleep(3 * time.Second)
		a.RegisterInVercel()
		ticker := time.NewTicker(20 * time.Second)
		for range ticker.C {
			a.RegisterInVercel()
		}
	}()

	go a.listenLoop()

	return fmt.Sprintf("Nodo Activo en puerto %s. ID: %s", port, a.myCode)
}

func (a *App) connectToBootstrapPeers() {
	var wg sync.WaitGroup
	for _, peerAddr := range BOOTSTRAP_PEERS {
		addrInfo, err := peer.AddrInfoFromString(peerAddr)
		if err != nil {
			continue
		}
		wg.Add(1)
		go func(info peer.AddrInfo) {
			defer wg.Done()
			_ = a.host.Connect(a.ctx, info)
		}(*addrInfo)
	}
	wg.Wait()
}

func (a *App) getMultiAddr() string {
	if a.host == nil {
		return ""
	}

	peerID := a.host.ID().String()

	// 1. Buscar direcciones públicas o de circuito relay primero
	for _, addr := range a.host.Addrs() {
		addrStr := addr.String()
		if !strings.Contains(addrStr, "127.0.0.1") && !strings.Contains(addrStr, "192.168.") && !strings.Contains(addrStr, "10.") {
			return fmt.Sprintf("%s/p2p/%s", addrStr, peerID)
		}
	}

	// 2. Si aún no hay IP pública, usar IP local privada
	for _, addr := range a.host.Addrs() {
		addrStr := addr.String()
		if !strings.Contains(addrStr, "127.0.0.1") && strings.Contains(addrStr, "/ip4/") {
			return fmt.Sprintf("%s/p2p/%s", addrStr, peerID)
		}
	}

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

	if len(target) == 6 && !strings.HasPrefix(target, "/ip4/") && !strings.HasPrefix(target, "/dnsaddr/") {
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

	ctxWithTimeout, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()

	if err := a.host.Connect(ctxWithTimeout, *info); err != nil {
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
