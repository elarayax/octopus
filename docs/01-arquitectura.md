# Arquitectura general

Este documento explica el "por qué" del diseño antes de entrar archivo por archivo.

## El problema

Hacer un chat entre dos personas usando el navegador y un servidor propio tiene
un problema clásico: **alguien tiene que ser el servidor**. Si los dos están
en la misma red, el que "escucha" puede hacer de servidor. Pero si están en
redes distintas (casa, trabajo, datos móviles), hace falta un rendez-vous.

## La solución: un buzón mínimo + WebRTC

```
   Maquina A                      Maquina B
  ┌───────────┐                 ┌───────────┐
  │  App Go   │                 │  App Go   │
  │  (Wails)  │                 │  (Wails)  │
  └─────┬─────┘                 └─────┬─────┘
        │                             │
        │  1. POST oferta             │
        │  2. GET buzón cada 1.5s     │
        ▼                             ▼
   ┌─────────────────┐         ┌─────────────────┐
   │  Vercel (buzón) │◄───────►│  Vercel (buzón) │
   │  solo señalización│        │  solo señalización│
   └─────────────────┘         └─────────────────┘
        │                             │
        └──── WebRTC directo ────────┘
              (texto + voz + imágenes)
```

**El servidor de Vercel NO transporta mensajes de chat.** Solo guarda y entrega
las ofertas/respuestas de WebRTC (el *handshake*). Una vez conectado, todo el
tráfico real va directo de máquina a máquina.

### Por qué un buzón y no WebSocket

- Un buzón (POST + GET) sobrevive a que either lado esté dormido o sin red.
- WebSocket requiere que ambos estén conectados *a la vez*; con un buzón,
  el mensaje queda ahí hasta que el otro vuelve.
- Es trivial de desplegar en Vercel (una función serverless) y no requiere
  servidor con estado.
- La pega: el polling. Se paga con latencia (1.5 s) y con peticiones HTTP
  constantes. A cambio, la app es trivialmente distribuible.

## El handshake WebRTC (por qué es tan simple)

WebRTC necesita que ambos extremos sedaq. Se hace con **offer/answer**:

```
A (quien conecta)                B (quien espera)
──────────────                   ─────────────
CreateOffer()                   
SetLocalDescription(oferta)      
gather ICE (candidatos)          
                                GET buzón → recibe oferta
                                SetRemoteDescription(oferta)
                                CreateAnswer()
                                SetLocalDescription(respuesta)
                                POST respuesta → buzón
GET buzón → recibe respuesta
SetRemoteDescription(respuesta)
                               
══════ ICE negocia rutas ══════►
══════ DTLS cifra ════════════►
══════ SCTP abre canales ══════►
```

Lo importante: **el SDP es opaco para el buzón**. Solo se codifica en base64
y se guarda como texto. El buzón no necesita entender nada de WebRTC.

### Por qué 2 DataChannels

| Canal | Configuración | Para qué |
|-------|---------------|----------|
| `chat` | fiable y ordenado | texto, imágenes, avatares, historial |
| `audio` | `maxRetransmits=0`, no ordenado | voz en vivo |

La voz necesita **baja latencia**, no integridad. Si un chunk de audio se
pierde, es preferible a esperar su retransmisión (que añadiría jitter). El
texto, en cambio, sí necesita orden y reliability (un mensaje a medias no
tiene sentido).

## Topología en estrella

Los clientes **no se hablan entre sí**. Todos se conectan al anfitrión
(`a.isHost == true`), y el anfitrión reenvía.

```
        B
        │
   ┌────┴────┐
 C ─┤  A  ├─ D        A = anfitrión (isHost)
   └─────────┘
```

**Por qué**: el buzón de señalización es un punto único. Si C quisiera hablar
directo con D, necesitaría otra negociación de WebRTC. La topología en
estrella hace que:

- Solo se necesita un handshake por peer nuevo.
- El anfitrión conoce a todos → puede compartir el **directorio** completo
  (`roster`) y el **historial** del canal.
- El tráfico entre C y D pasa por A, que lo reenvía (ver `setupDataChannel`).

El precio: el tráfico pasa por el anfitrión (más latencia, más carga).

## El sistema de identidad

Cada equipo tiene un **código fijo** de 6 caracteres, como `2JJZZQ`.

```
~/.chat_p2p/identity.key   → 32 bytes aleatorios (clave privada)
        ↓ SHA-256
   hash[0..5] → mapa a "ABC…23456789"  →  "2JJZZQ"
```

**Por qué derivarlo de una clave y no generarlo al azar**: el código es la
dirección en el buzón. Si fuera aleatorio y se perdiera, el equipo sería
inaccesible. Si se deriva de una clave persistente, es:
- **Estable**: no cambia al cambiar de red, puerto, IP o nombre de usuario.
- **Irrecuperable**: sin la clave no se puede adivinar (6 caracteres de 32
  = 1.000 millones de combinaciones; el espacio es 32^6 ≈ 1.07e9, por eso el
  alfabeto excluye `I`, `O`, `0`, `1` para evitar confusiones al dictarlo).

`getOrCreateFixedCode()` tiene además una **ruta de migración**: si encuentra
códigos viejos por puerto (`fixed_code_8080.txt`), adopta el primero para que
los amigos que ya lo conocían sigananthus dapat conectarse.

## Modelo de mensajes

Todo lo que cruza la red es un `Packet` (definido en `app.go`):

```go
type Packet struct {
    Type    string `json:"type"`   // "text", "audio", "hello", "avatar", ...
    Sender  string `json:"sender"`
    Text    string `json:"text,omitempty"`
    Audio   string `json:"audio,omitempty"`   // base64
    Code    string `json:"code,omitempty"`    // código fijo del emisor
    Avatar  string `json:"avatar,omitempty"`  // base64 WebP
    Image   string `json:"image,omitempty"`   // base64 WebP
    History string `json:"history,omitempty"` // JSON con mensajes
    Online  bool   `json:"online,omitempty"`
    Channel string `json:"channel,omitempty"` // JSON con ChannelInfo
}
```

**Por qué un solo tipo con `omitempty`**: reduce el código y el tráfico
(cada mensaje solo lleva los campos que usa). El campo `Type` es el
discriminante: `handlePacket` hace el `switch`.

## El protocolo de presencia

Al abrirse un canal, ambos lados se presentan:

```
→ hello     (nombre + código)
→ avatar    (imagen)
→ roster    (directorio completo del canal, con presencia)
→ history_req  /  history   (sincronización de mensajes)
→ channel   (solo el anfitrión comparte la identidad del canal)
```

**Por qué `roster`**: los clientes se conectan en estrella, así que un cliente
nuevo solo conoce al anfitrión. El anfitrión le manda el directorio completo
para que la lista de usuarios de la UI esté poblada de inmediato.

**Por qué `history_req`**: al entrar a un canal, quieres ver los mensajes
anteriores. Cada lado exporta su historial y el otro lo fusiona con
`mergeHistory` (que deduplica por contenido + timestamp).

## El presupuesto del historial

```go
const historyBudget = 1500 * 1024  // 1.5 MB
```

El SCTP de WebRTC tiene un tope de mensaje. `newPeerConnection()` lo sube a
4 MB con `SetSCTPMaxMessageSize(4 * 1024 * 1024)`. El historial se limita a
1.5 MB para dejar aire para las imágenes. `exportHistory` toma los 500 mensajes
más recientes y **los invierte** para entregarlos en orden cronológico
(la consulta es `DESC` por efficiency, pero el chat se lee de arriba abajo).

## Dónde vive cada cosa

| Dato | Ubicación | Por qué |
|------|-----------|---------|
| Código fijo | `~/.chat_p2p/fixed_code.txt` | debe sobrevivir reinicios |
| Clave privada | `~/.chat_p2p/identity.key` | origen del código |
| Avatar | `~/.chat_p2p/avatar.webp` | formato compacto, animado |
| BD | `~/.chat_p2p/app_data.db` | mensajes, directorio, canales, config |
| Tema / layout | `~/.chat_p2p/mods/default/` | editable por el usuario |
| Señalización | Vercel (efímera) | solo ofertas/respuestas |

## El `App`: un struct, un mutex

```go
type App struct {
    ctx       context.Context
    username  string
    myCode    string
    myPort    string
    isHost    bool
    peers     map[string]*PeerSession
    onlineSet map[string]bool
    currentChannelID int
    stopPoll  chan struct{}
    db        *sql.DB
    mu        sync.Mutex
}
```

Un único `App` vive durante toda la app (Wails lo crea una vez y lo expone
a la UI). `a.mu` protege **todos** los campos mutables.

**El patrón que se repite en todo el código** — y su porqué:

```go
a.mu.Lock()
sessions := make([]*PeerSession, 0, len(a.peers))
for _, s := range a.peers {
    sessions = append(sessions, s)   // copio las referencias
}
a.mu.Unlock()                        // <-- suelto el lock

for _, s := range sessions {         // trabajo potencialmente lento
    s.dc.SendText(...)               // sin lock: no bloquea a los demás
}
```

Esto es **clave** en un servidor de chat:
1. Copiar bajo el lock evita iterar el mapa mientras otro hilo lo modifica
   (en Go, iterar un mapa concurrente provoca un panic).
2. Liberar el lock antes del trabajo lento (red, disco) evita que un peer
   lento bloquee toda la app.

`sendSignal`, `broadcastX`, `handlePacket` y `GetUsers` siguen esta regla.

## Resumen del ciclo de vida

```
startup(ctx)
   ├─ initDB()              → abre SQLite, aplica migraciones
   ├─ restaura el username  → de la tabla configuracion
   └─ restaura el título    → del canal activo

StartServer(port)           ← el usuario pulsa "Iniciar Servidor"
   ├─ genera/recupera el código fijo
   ├─ crea el canal del anfitrión en la BD
   └─ lanza pollMailbox()   ← goroutine que consulta el buzón cada 1.5s

pollMailbox()               ← bucle infinito
   ├─ GET buzón
   ├─ offer  → handleIncomingOffer() → responde con un answer
   └─ answer → handleIncomingAnswer() → aplica la respuesta

Conectado:
   ├─ DataChannel "chat"   → mensajes, imágenes, historial
   └─ DataChannel "audio"  → voz
```
