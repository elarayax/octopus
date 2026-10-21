# `webrtc.go` — Identidad, señalización y conexiones P2P

Es el corazón de la app (~780 líneas). Aquí vive: cómo se genera tu código
personal, cómo se habla con el buzón de Vercel, y cómo se estabelece una
conexión WebRTC con el otro usuario.

## La estructura `PeerSession`

```go
type PeerSession struct {
    id  string
    pc  *webrtc.PeerConnection
    dc  *webrtc.DataChannel // texto: fiable y ordenado
    dca *webrtc.DataChannel // audio: no fiable, sin orden (baja latencia)
}
```

Un `PeerSession` por cada peer conectado. `dc` y `dca` son los dos canales de
datos. Se guardan separados porque tienen políticas de entrega distintas
(ver [Arquitectura](01-arquitectura.md#por-qué-2-datachannels)).

## El cliente HTTP endurecido

```go
var vercelClient = &http.Client{
    Transport: &http.Transport{
        DisableKeepAlives: true,
    },
    Timeout: 10 * time.Second,
}
```

**Por qué `DisableKeepAlives`**: este es el fix del error
`Unsolicited response received on idle HTTP channel`. Explicado a fondo en
[Bugs corregidos](11-bugs-corregidos.md#1-unsolicited-response-received-on-idle-http-channel).

Resumen: Go guarda las conexiones HTTP en un pool ocioso. Vercel cierra las
conexiones inactivas. Cuando Go reutiliza una conexión que el servidor ya
cerró, el edge responde `400 Bad Request` sobre un canal que Go ya considera
inactivo, y Go lo loguea. Al no haber keep-alives, cada petición usa una
conexión nueva y el problema desaparece.

**Por qué `Timeout: 10s`**: sin timeout, un servidor lento bloquearía el
hilo para siempre (y la UI se quedaría colgada).

---

# Parte 1 — La identidad (código fijo)

## `generateRoomCode() string`

```go
func generateRoomCode() string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    b := make([]byte, 6)
    _, _ = rand.Read(b)
    for i := range b {
        b[i] = chars[int(b[i])%len(chars)]
    }
    return string(b)
}
```

Genera un código aleatorio de 6 caracteres.

**Por qué este alfabeto** (32 caracteres): excluye `I`, `O`, `0` y `1` para
evitar confusiones al leer o dictar un código en voz alta (`I`/`1`, `O`/`0`).
32 = 2^5 → el hash se puede mapear con 5 bits por carácter.

**Por qué se usa `rand.Read` y no `math/rand`**: `math/rand` no es
criptográficamente seguro. Aquí no importa mucho, pero `crypto/rand` es el
default correcto.

## `codeFromKey(keyData []byte) string`

```go
func codeFromKey(keyData []byte) string {
    h := sha256.Sum256(keyData)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    var sb strings.Builder
    for i := 0; i < 6; i++ {
        sb.WriteByte(chars[int(h[i])%len(chars)])
    }
    return sb.String()
}
```

**Deriva el código del hash SHA-256 de la clave privada.**

**Por qué SHA-256 y no la clave directamente**: la clave son 32 bytes; el
código son 6 caracteres legibles. El hash actúa como una "compresión" y
además impide que alguien con acceso al archivo `fixed_code.txt` pueda
reconstruir la clave privada.

**Por qué `h[i]` y no un solo byte**: se usan los 6 primeros bytes del hash,
cada uno mapeado a un carácter. Son 6 bytes = 48 bits de entropía efectiva.

**Por qué es determinista**: el mismo equipo → el mismo código, siempre. Es
lo que hace que el código sea "fijo" y serves para que los amigos te
encuentren.

## `persistCode(codePath, code string) string`

Escribe el código en disco con permisos `0600` (solo el dueño) y lo devuelve.

**Por qué devolver el código**: permite escribir `return persistCode(...)` en
una sola línea en los puntos de llamada.

## `getOrCreateFixedCode() string`

La función más importante para la experiencia de usuario. Tiene **5 rutas**,
en orden de prioridad:

```
1. ¿Ya existe ~/.chat_p2p/fixed_code.txt?
      → úsalo                                          (camino normal)

2. ¿Hay códigos viejos por puerto (fixed_code_8080.txt, ...)?
      → adopta el primero (en orden: 8080 primero)       (migración)

3. ¿Existe identity.key?
      → deriva el código de él                          (migración)

4. ¿Hay identidades viejas por puerto (identity_*.key)?
      → adopta la primera como identidad global          (migración)

5. Primera vez en este equipo
      → genera 32 bytes aleatorios, los guarda, deriva el código
```

**Por qué las migraciones**: la app evolucionó. Antes el código dependía del
puerto (y cambiaba al reiniciar el servidor en otro puerto); ahora es global
por equipo. Sin las rutas 2-4, los amigos que ya conocían tu código old
`ABC123` dejarían de poder encontrarte. La ruta 2 prioriza `8080` porque era
el puerto por defecto.

**Por qué 32 bytes de clave**: 256 bits de entropía. El código de 6
caracteres es "público" (se dicta por teléfono), la clave es la parte
privada.

---

# Parte 2 — WebRTC

## `newPeerConnection() (*webrtc.PeerConnection, error)`

```go
func newPeerConnection() (*webrtc.PeerConnection, error) {
    s := webrtc.SettingEngine{}
    s.SetSCTPMaxMessageSize(4 * 1024 * 1024)
    api := webrtc.NewAPI(webrtc.WithSettingEngine(s))
    return api.NewPeerConnection(getRTCConfig())
}
```

**Por qué `SetSCTPMaxMessageSize(4MB)`**: por defecto SCTP limita cada
mensaje a 64 KB. La app envía:
- Historial completo (hasta 1.5 MB).
- Imágenes WebP de hasta 400 KB.
- Avatares de hasta 300 KB.

Sin subir el tope, todo eso se truncaría. 4 MB da margen.

**Por qué una `SettingEngine` propia en vez de usar la global**: el motor de
configuración es *global* en pion. Usar uno local evita que otra parte del
programa cambie los ajustes a mitad de una conexión.

## `getRTCConfig() webrtc.Configuration`

```go
ICEServers: []webrtc.ICEServer{
    {URLs: []string{
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
    }},
},
```

**Por qué STUN y no TURN**: STUN solo descubre la IP pública (gratis, sin
cuenta). TURN hace de relay cuando la NAT es simétrica (pago, y hay que
configurar credenciales). La app empieza solo con STUN: en la mayoría de las
redes domésticas y móviles el P2P funciona directo. Añadir TURN sería el
siguiente paso natural si hay usuarios en redes corporativas.

**Por qué 3 servidores STUN**: redundancia. Si uno está caído, los otros
responden. El gathering tarda ~30 ms en condiciones normales (medido).

---

# Parte 3 — El ciclo del servidor y el buzón

## `StartServer(port string) string`

```go
func (a *App) StartServer(port string) string {
    a.mu.Lock()
    if a.stopPoll != nil {
        close(a.stopPoll)      // detener el polling anterior
    }
    a.stopPoll = make(chan struct{})
    stopChan := a.stopPoll
    a.myPort = port
    a.isHost = true
    a.myCode = getOrCreateFixedCode()
    code := a.myCode
    a.currentChannelID = a.upsertCanal(code, "Chat P2P", "Texto & Voz en Vivo", "🐙")
    a.mu.Unlock()

    info := a.GetChannelInfo()
    a.SetChannelInfo(info.Nombre, info.Subtitulo, info.Icono)

    go a.pollMailbox(stopChan)
    return fmt.Sprintf("Servidor activo con ID Fijo: %s", code)
}
```

**Qué hace**: arranca el "servidor" (que en realidad es solo un buzón
consultor) y devuelve el código fijo.

**Por qué `close(a.stopPoll)`**: si el usuario pulsa "Iniciar Servidor" dos
veces, habría dos goroutines consultando el buzón → ofertas duplicadas →
conexiones duplicadas. El canal cerrado le dice a la goroutine anterior que
termine.

**Por qué `go a.pollMailbox(stopChan)`**: el polling es infinito. Si fuera
síncrono, `StartServer` no volvería nunca y la UI se quedaría congelada.

**Por qué `isHost = true`**: quien "inicia el servidor" es el anfitrión de la
topología en estrella. Y como el código es fijo, **siempre** será el anfitrión
frente a sus amigos (no hay un "servidor" central al que Chacun se conecte).

## `pollMailbox(stopChan <-chan struct{})`

```go
for {
    select {
    case <-stopChan:
        return
    case <-ticker.C:
        resp, err := vercelClient.Get(fmt.Sprintf("%s?for=%s", VERCEL_URL, code))
        ...
        for _, m := range res.Messages {
            if m.Type == "offer" {
                go a.handleIncomingOffer(m.From, m.SDP)
            } else if m.Type == "answer" {
                go a.handleIncomingAnswer(m.From, m.SDP)
            }
        }
    }
}
```

**El bucle**:

1. `select` con dos canales: si se cierra `stopChan`, se sale; si no, cada
   1.5 s se consulta el buzón. Es la forma idiomática de un worker
   cancelable.

2. `GET {VERCEL_URL}?for={miCódigo}`: el buzón devuelve los mensajes dirigidos
   a este equipo.

3. Solo se procesan `offer` y `answer` — los otros tipos (`hello`, `avatar`,
   `roster`…) viajan por el DataChannel, no por el buzón.

**Por qué `go a.handleIncomingOffer(...)`**: si el handler se ejecutara en el
mismo hilo, una negociación lenta (hasta 5 s esperando el gathering) detendría
el polling y se perderían mensajes.

**Por qué 1.5 s**: es el compromiso entre latencia y consumo. Cada polling es
una petición HTTP (con TLS). Con 1.5 s, la señalización tarda como máximo
~1.5 s en ambas direcciones.

**Por qué los errores se ignoran (`continue`)**: si el buzón falla un instante
(red, edge saturado), no se debe tumbar el polling. La siguiente iteración
reintenta.

---

# Parte 4 — Los DataChannels

## `setupDataChannel(remoteID string, dc *webrtc.DataChannel)`

Es el corazón del tráfico de datos. Instala tres manejadores:

### `dc.OnOpen(...)` — el saludo

```go
dc.OnOpen(func() {
    if isChat {
        runtime.EventsEmit(a.ctx, "peer_connected", ...)
        a.sendHello(dc)        // nombre + código
        a.sendAvatarTo(dc)     // foto
        a.sendKnownPeersTo(dc) // directorio completo
        // pedir el historial
        dc.SendText(Packet{Type: "history_req", Code: a.myCode})
        // el anfitrión comparte la identidad del canal
        if isHost {
            a.broadcastChannelInfo(a.GetChannelInfo())
        }
    }
})
```

**Por qué solo el canal `chat` dispara el saludo**: el canal de audio puede
existir sin que el de texto esté listo. La handshake de presentación debe
ocurrir **una vez**, en el canal fiable.

**Por qué el orden importa**:
1. `hello` → el otro sabe tu nombre y código (te añade al directorio).
2. `avatar` → te ve tu foto.
3. `roster` → sabes quiénes más hay en el canal (te lo da el anfitrión).
4. `history_req` → pides los mensajes anteriores.

**Por qué `isHost` comparte el canal**: la identidad (nombre, subtítulo, ícono)
es del anfitrión. Se envía para que los clientes adopten el mismo nombre de
canal.

### `dc.OnMessage(...)` — el enrutador

```go
dc.OnMessage(func(msg webrtc.DataChannelMessage) {
    var pkt Packet
    if err := json.Unmarshal(msg.Data, &pkt); err == nil {
        a.handlePacket(remoteID, pkt)

        // Retransmitir a los demás peers por el canal adecuado
        a.mu.Lock()
        for id, session := range a.peers {
            if id == remoteID { continue }
            ch := session.dc
            if pkt.Type == "audio" && session.dca != nil &&
               session.dca.ReadyState() == webrtc.DataChannelStateOpen {
                ch = session.dca
            }
            if ch != nil && ch.ReadyState() == webrtc.DataChannelStateOpen {
                ch.SendText(string(msg.Data))
            }
        }
        a.mu.Unlock()
    }
})
```

**Este es el corazón de la topología en estrella**: todo lo que llega de un
peer se procesa localmente **y** se reenvía al resto.

**Por qué el audio va por `dca`**: si se reenviará por el canal fiable, la
voz arrastraría la latencia de las retransmisiones. Se enruta al canal no
fiable.

**Por qué se reenvía el `msg.Data` crudo y no el `pkt` re-marshaleado**:
ahorra CPU (no hay que serializar de nuevo) y preserva exactamente lo recibido.

**Por qué `json.Unmarshal` con `err == nil`**: si un peer manda basura, se
ignora sin tumbar la conexión.

### `dc.OnClose(...)`

```go
dc.OnClose(func() {
    if isChat {
        a.removePeer(remoteID)
        runtime.EventsEmit(a.ctx, "peer_disconnected", remoteID)
    }
})
```

**Por qué solo el canal `chat`**: el de audio puede cerrarse sin que la
conexión se haya perdido realmente.

## `sendHello(dc)` / `broadcastHello()`

`sendHello` envía el paquete `hello` (nombre + código) por un canal concreto.
`broadcastHello` lo envía a **todos** los peers abiertos.

**Por qué existe `broadcastHello`**: cuando el usuario cambia el nombre, hay
que avisar a todos sin reconectar (ver `SetUsername`).

## `sendKnownPeersTo(dc)`

```go
for _, m := range a.getMiembros() {
    if m.Codigo == myCode { continue }
    pkt := Packet{Type: "roster", Sender: m.Nombre, Code: m.Codigo,
                  Avatar: m.Avatar, Online: online[m.Codigo]}
    dc.SendText(...)
}
```

**Por qué el "directorio completo"**: el nuevo peer solo conoce al anfitrión.
El anfitrión le pasa todos los miembros conocidos (del directorio persistente
en SQLite) con su estado de presencia actual.

**Por qué `online` se calcula aparte**: `getMiembros()` devuelve el directorio
persistente; `onlineSet` dice quién está conectado ahora. Son dos fuentes
distintas que se combinan aquí.

## `broadcastChannelInfo(info)` / `broadcastBye(code)`

Dos difusión más:

- `broadcastChannelInfo`: el anfitrión comparte la identidad del canal.
- `broadcastBye`: avisa a los demás que un usuario se fue, para que lo
  marquen como offline sin esperar un timeout.

---

# Parte 5 — El protocolo de mensajes

## `handlePacket(remoteID string, pkt Packet)`

El despachador central. Antes del `switch` hay una pieza clave:

```go
code := pkt.Code
if code == "" {
    code = remoteID
}
```

**Por qué**: algunos paquetes antiguos no incluyen `Code`. En ese caso se usa
el ID del peer como respaldo, para que la identidad nunca quede vacía (vacía
rompería la deduplicación y la presencia).

El `switch` cubre:

| Tipo | Qué hace |
|------|----------|
| `audio` | reemite el audio a la UI (`receive_audio`) |
| `hello` | marca presente, registra en el directorio, avisa a la UI |
| `avatar` | idem + guarda la imagen |
| `roster` | registra un miembro (sin pisar la presencia de un peer directo) |
| `bye` | marca ausente |
| `channel` | adopta la identidad del canal (solo lo envía el anfitrión) |
| `image` | guarda la imagen en el historial y la muestra |
| `history_req` | responde con nuestro historial |
| `history` | fusiona el historial recibido (`mergeHistory`) |
| default | mensaje de texto normal |

**Detalles importantes**:

- **`if code == a.myCode { break }`**: ignora tus propios mensajes que vuelven
  por la red (evita duplicados).
- **En `roster`**: `_, directo := a.peers[code]` — si el peer está conectado
  directamente, su presencia manda sobre la del roster. Sin esto, el roster
  (más viejo) podría marcarlo como offline.
- **En `bye`**: `runtime.EventsEmit(a.ctx, "peer_info", UserEntry{Name: "", Online: false})` — con
  nombre vacío a propósito: la UI lo interpreta como "este usuario se fue".

## `handleIncomingOffer(fromPeerID, offerB64 string)`

```go
sdpBytes, err := base64.StdEncoding.DecodeString(offerB64)
var offer webrtc.SessionDescription
json.Unmarshal(sdpBytes, &offer)

pc, err := newPeerConnection()

// si ya había una sesión con este peer, cerrar la vieja
a.mu.Lock()
if old, exists := a.peers[fromPeerID]; exists {
    old.pc.Close()
}
a.peers[fromPeerID] = session
a.mu.Unlock()

pc.OnDataChannel(func(dc *webrtc.DataChannel) { ... })
pc.OnICEConnectionStateChange(...)

pc.SetRemoteDescription(offer)
gatherComplete := webrtc.GatheringCompletePromise(pc)
answer, err := pc.CreateAnswer(nil)
pc.SetLocalDescription(answer)

select {
case <-gatherComplete:
case <-time.After(5 * time.Second):
}

a.sendSignal(fromPeerID, "answer", answerB64)
```

**El flujo**:

1. **Decodificar**: el SDP viaja como base64 de un JSON
   `{"type":"offer","sdp":"..."}`. Se decodifica en dos pasos
   (base64 → JSON → SessionDescription).

2. **Cerrar la sesión anterior**: si el peer reconecta, se cierra la vieja
   para no dejar conexiones zombis.

3. **`OnDataChannel`**: aquí es donde el *peer que espera* recibe los canales.
   Pion unifica ambos DataChannels bajo un mismo manejador y se distinguen
   por `dc.Label()` ("chat" vs "audio").

4. **`OnICEConnectionStateChange`**: si la conexión se pierde, se limpia el
   peer y se avisa a la UI. Nota: **solo** reacciona a
   `Disconnected`/`Failed`/`Closed`, no a `Connected` (que es el estado normal).

5. **La espera del gathering**:
   ```go
   select {
   case <-gatherComplete:
   case <-time.After(5 * time.Second):
   }
   ```
   **Por qué**: el SDP debe incluir los candidatos ICE. Pero si la red está
   bloqueada, el gathering puede tardar; los 5 s son un tope para no dejar al
   usuario esperando indefinidamente. **Si se agota, el SDP sale sin candidatos
   y la conexión P2P no podrá establecerse** (pero el signaling sí termina).

6. **`sendSignal`**: la respuesta vuelve al buzón.

## `handleIncomingAnswer(fromPeerID, answerB64 string)`

```go
session, exists := a.peers[fromPeerID]
if exists && session.pc != nil && session.pc.RemoteDescription() == nil {
    session.pc.SetRemoteDescription(answer)
}
```

**Por qué la comprobación `RemoteDescription() == nil`**: evita aplicar la
respuesta dos veces (si el buzón devuelve el mismo mensaje en dos polls) y
evita aplicarse una respuesta a una sesión que ya está cerrada.

## `sendSignal(to, sigType, sdp string) error`

```go
payload := map[string]string{"to": to, "from": from, "type": sigType, "sdp": sdp}
data, _ := json.Marshal(payload)

var lastErr error
for attempt := 0; attempt < 3; attempt++ {
    if attempt > 0 {
        time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
    }
    resp, err := vercelClient.Post(VERCEL_URL, "application/json", bytes.NewBuffer(data))
    if err != nil { lastErr = err; continue }

    body, readErr := io.ReadAll(resp.Body)
    resp.Body.Close()
    if readErr != nil { lastErr = readErr; continue }

    if resp.StatusCode == http.StatusOK { return nil }

    lastErr = fmt.Errorf("el servidor respondió %d: %s", resp.StatusCode, ...)

    // Un 4xx (salvo 429) significa que el payload es inválido: reintentar no ayuda.
    if resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != http.StatusTooManyRequests {
        return lastErr
    }
}
return lastErr
```

**Por qué un `map[string]string` y no un struct**: el formato del buzón es
minimalista y genérico (cualquier tipo de mensaje con 4 campos). Un map es
más flexible que añadir campos a una struct.

**Por qué 3 intentos con espera creciente**: el edge de Vercel puede estar
saturado o perder una conexión. 500 ms y 1000 ms de espera son suficientes
para que se recupere sin que el usuario note nada.

**Por qué no se reintenta un 4xx**: un `400` significa "payload inválido" —
repetirlo 3 veces solo retrasa el error. Un `429` (demasiadas peticiones) sí
merece reintento.

**Por qué ahora se valida el código de respuesta**: antes se ignoraba y un
`400` se tomaba por éxito. La UI decía "Conectando P2P..." y se quedaba
colgada para siempre, sin explanation. Ver
[Bugs corregidos](11-bugs-corregidos.md#2-el-400-se-tomaba-por-éxito).

## `removePeer(id string)`

```go
a.mu.Lock()
if s, exists := a.peers[id]; exists {
    s.pc.Close()
    delete(a.peers, id)
}
remaining := len(a.peers)
delete(a.onlineSet, id)
if remaining == 0 {
    a.onlineSet = make(map[string]bool)
}
a.mu.Unlock()

a.broadcastBye(id)
```

**Por qué se cierra el `PeerConnection`**: sin `Close()`, los sockets UDP y el
hilo de ICE se quedan vivos (fuga de recursos).

**Por qué se limpia todo `onlineSet` si no queda ningún peer**: si no hay
conexiones directas, no hay forma de saber quién está. Los nombres y avatares
se conservan en SQLite.

**Por qué `broadcastBye` fuera del lock**: es I/O de red.

## `ConnectToPeer(input string) string`

El método que ejecuta el usuario. Tiene **cuatro fases**:

### Fase 1 — Interpretar la entrada

```go
raw := strings.TrimSpace(input)
target := raw

if strings.Contains(target, "Código: ") {
    // "Código: ABC123" → "ABC123"
} else if len(target) > 6 && strings.Contains(target, "/p2p/") {
    // "https://.../p2p/ABC123" → "ABC123"
}

target = strings.ToUpper(strings.TrimSpace(target))
if len(target) != 6 {
    return fmt.Sprintf("Código inválido (%s). Debe tener 6 caracteres.", target)
}
```

**Por qué acepta varios formatos**: el usuario puede pegar el código tal cual,
o copiar un enlace completo. Es más tolerante = menos fricción.

**Por qué `ToUpper`**: el código se muestra en mayúsculas; si el usuario lo
escribe en minúsculas debe funcionar igual.

### Fase 2 — Validaciones

```go
if myCode == "" {
    return "Debes iniciar el servidor primero para activar tu ID fijo."
}
if target == myCode {
    return "No puedes conectarte a tu propio código."
}
```

**Por qué la primera**: sin `StartServer` no hay código propio, y el buzón
necesita un `from` válido para enrutar la señal.

### Fase 3 — Preparar la conexión

```go
a.isHost = false
a.currentChannelID = a.upsertCanal(target, "Chat P2P", ...)

pc, err := newPeerConnection()
dc, err := pc.CreateDataChannel("chat", nil)
dca, err := pc.CreateDataChannel("audio", &webrtc.DataChannelInit{
    MaxRetransmits: &maxRetransmits,   // 0 = no retransmitir
    Ordered:        &unordered,        // false = sin orden
})
```

**Por qué `isHost = false`**: quien conecta es un cliente, no el anfitrión.

**Por qué el canal de audio con `MaxRetransmits: 0` y `Ordered: false`**: la
voz en vivo prefiere perder un paquete a esperar su retransmisión (que
generaría latencia y jitter).

**Por qué `upsertCanal`**: al conectar con un código nuevo, se crea el canal
en la BD para que aparezca en la lista de canales.

### Fase 4 — Ofertar y enviar

```go
gatherComplete := webrtc.GatheringCompletePromise(pc)
offer, err := pc.CreateOffer(nil)
pc.SetLocalDescription(offer)

select {
case <-gatherComplete:
case <-time.After(5 * time.Second):
}

localOffer := pc.LocalDescription()
offerBytes, err := json.Marshal(localOffer)
offerB64 := base64.StdEncoding.EncodeToString(offerBytes)

if err := a.sendSignal(target, "offer", offerB64); err != nil {
    return fmt.Sprintf("Error enviando solicitud a Vercel: %s", err.Error())
}
return fmt.Sprintf("Solicitud enviada a %s. Conectando P2P...", target)
```

**Por qué `GatheringCompletePromise` ANTES de `CreateOffer`**: la promesa
debe registrarse antes de que empiece el gathering (que dispara
`SetLocalDescription`). Si se creara después, la promesa ya no se resolvería
y se esperarían los 5 s siempre.

**Por qué se marshal-a el `LocalDescription()` y no el `offer` original**:
`LocalDescription()` incluye los candidatos ICE recolectados. El `offer`
inicial no los tiene.

**Por qué el mensaje de éxito no dice "conectado"**: en este punto solo se
envió la oferta. La conexión se completará cuando llegue la respuesta. El
evento `peer_connected` (emitido en `OnOpen`) es el que confirma.
