# `app.go` — Estado global y API para la UI

319 líneas. Define el struct `App` (el estado compartido), los tipos de datos
que viajan entre Go y React, y los métodos que la UI invoca.

## Los tipos de datos

### `Message` — lo que ve el usuario

```go
type Message struct {
    Sender string `json:"sender"`
    Text   string `json:"text"`
    Kind   string `json:"kind"`            // "text" o "image"
    Image  string `json:"image,omitempty"` // data URL (solo kind=image)
    Time   string `json:"time,omitempty"`
}
```

**Por qué `Kind` en vez de un tipo diferente**: la UI necesita distinguir
texto de imagen para elegir qué renderizar. Un solo tipo simplifica el array
del historial.

**Por qué `Image` es una data URL** (`data:image/webp;base64,...`): el
frontend puede asignarla directamente a un `<img src>`. Sin doble
conversión.

### `Packet` — lo que cruza la red

Ver [Arquitectura](01-arquitectura.md#modelo-de-mensajes) para el detalle
completo. Puntos clave:

- `Type` es el discriminante (`text`, `audio`, `hello`, `avatar`, `bye`,
  `image`, `history_req`, `history`, `roster`, `channel`).
- `omitempty` en casi todos los campos → cada mensaje solo lleva lo que usa.
- `Code` = el **código fijo** del emisor. Es lo que permite saber *quién*
  mandó algo aunque el `Sender` (nombre) se repita.

### `ChannelInfo` y `UserEntry` — lo que pinta la UI

```go
type ChannelInfo struct {
    Nombre    string `json:"nombre"`
    Subtitulo string `json:"subtitulo"`
    Icono     string `json:"icono"`
}
```

```go
type UserEntry struct {
    Name   string `json:"name"`
    Online bool   `json:"online"`
    Avatar string `json:"avatar"`
    Self   bool   `json:"self"`
}
```

**Por qué `UserEntry` incluye `Self`**: la UI necesita saber cuál es "tú"
para no mostrarte como peer ni permitirte hablar contigo mismo.

## El struct `App`

```go
type App struct {
    ctx              context.Context
    username         string
    myCode           string
    myPort           string
    isHost           bool
    peers            map[string]*PeerSession
    onlineSet        map[string]bool // presencia por código
    currentChannelID int
    stopPoll         chan struct{}
    db               *sql.DB
    mu               sync.Mutex
}
```

| Campo | Para qué |
|-------|----------|
| `ctx` | contexto de Wails; imprescindible para `EventsEmit` |
| `username` | nombre visible; se persiste en la tabla `configuracion` |
| `myCode` | **código fijo** de este equipo (lo asigna `StartServer`) |
| `myPort` | puerto legado; hoy el puerto ya no se usa para escuchar |
| `isHost` | `true` si soy el anfitrión de la topología en estrella |
| `peers` | mapa código → sesión WebRTC |
| `onlineSet` | códigos presentes. **Nota**: el directorio (nombre+avatar) vive en SQLite, aquí solo la presencia |
| `currentChannelID` | id de la fila `canal` que se está mostrando |
| `stopPoll` | canal para detener el `pollMailbox` al reiniciar el servidor |
| `db` | pool de SQLite |
| `mu` | mutex que protege todo lo anterior |

### `NewApp()`

```go
func NewApp() *App {
    return &App{
        username:  "Anónimo",
        peers:     make(map[string]*PeerSession),
        onlineSet: make(map[string]bool),
    }
}
```

**Por qué se inicializan los mapas aquí y no en `startup`**: `NewApp` se llama
antes de que Wails registre los bindings; si un método se invocara antes de
`startup`, un mapa `nil` provocaría un panic al escribir en él. Inicializar
los mapas en el constructor los hace seguros desde el primer momento.

**Por qué "Anónimo" y no ""**: la UI siempre necesita un nombre que mostrar.

### `startup(ctx)`

```go
func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
    if err := a.initDB(); err != nil { ...; return }
    if saved := a.getSetting("username"); strings.TrimSpace(saved) != "" {
        a.username = saved
    }
    if info := a.GetChannelInfo(); info.Nombre != "" {
        runtime.WindowSetTitle(a.ctx, info.Nombre)
    }
}
```

**Por qué restaura la sesión**: la app es una identidad fija por equipo. Si
cada arranque pidiera el nombre otra vez, el usuario tendría que reconfigurar
todo. Se guarda en la tabla `configuracion` (clave/valor).

**Por qué restaura el título**: el canal activo es persistente, así que al
abrir la app debe verse el canal en el que se estaba, no el primero.

## Los métodos

### `SetUsername(name) string` / `GetUsername() string`

```go
func (a *App) SetUsername(name string) string {
    a.mu.Lock()
    a.username = strings.TrimSpace(name)
    if a.username == "" { a.username = "Anónimo" }
    username := a.username
    a.mu.Unlock()

    a.saveSetting("username", username)   // persistir FUERA del lock
    a.broadcastHello()                   // avisar a los peers
    return username
}
```

**Por qué el patrón lock → copiar → unlock → trabajar**: `saveSetting` va a
disco y `broadcastHello` va a la red. Hacerlos con el lock tomado
serializaría toda la app detrás del disco. Copiar el valor y soltar el lock
evita eso.

**Por qué `broadcastHello`**: si el usuario cambia el nombre, los peers deben
saberlo sin reconectarse. El paquete `hello` lleva el nombre nuevo.

**Por qué devuelve el string**: la UI usa el valor ya normalizado (trimmed,
con fallback) para mostrarlo.

### `SendMessage(text) string`

```go
sent := 0
for _, s := range sessions {
    if s.dc != nil && s.dc.ReadyState() == webrtc.DataChannelStateOpen {
        if err := s.dc.SendText(string(data)); err == nil { sent++ }
    }
}
if sent > 0 {
    a.saveMessage(currentUser, text)
    runtime.EventsEmit(a.ctx, "receive_message", Message{...})
    return "Enviado"
}
```

**Por qué se guarda en la BD y se emite el evento local**: el mensaje propio
no vuelve por la red (no hay eco del servidor). Para que aparezca en pantalla
como los demás, la app lo guarda y emite `receive_message` localmente. Así el
código de renderizado es **uno solo** para mensajes propios y ajenos.

**Por qué comprueba `ReadyState`**: el DataChannel puede estar cerrándose
(conexión perdida) y `SendText` fallaría silenciosamente. Se cuentan los
envíos exitosos para poder decir "no hay peers" con precisión.

### `GetMyCode() string`

Devuelve el código fijo. Lo usa la UI para mostrarlo y copiarlo.

### `SwitchToCanal(codigo) string`

```go
info, id := a.getCanalByCodigo(codigo)
if id == 0 || id == a.currentChannelID {
    id = a.upsertCanal(codigo, info.Nombre, info.Subtitulo, info.Icono)
}
a.currentChannelID = id
```

Cambia el canal visible **sin crear una conexión nueva**. Es solo un cambio de
vista: la conexión WebRTC es independiente del canal.

Emite `channel_info` y `channel_switched` para que el frontend recargue el
historial y la lista de canales.

### `GetNodeInfo() NodeInfo`

```go
type NodeInfo struct {
    Code      string `json:"code"`
    MultiAddr string `json:"multiAddr"`
}
```

**Por qué `MultiAddr` devuelve el mismo código**:Libp2p usaba direcciones
multiaddr; la app migró a un modelo de buzón, así que el campo se conserva por
compatibilidad con la UI pero ya no significa nada técnico.

### `GetUsers() []UserEntry`

```go
users := []UserEntry{{Name: own, Online: true, Avatar: a.avatarDataURL(), Self: true}}
```

**Por qué el orden importa**: primero tú (siempre `Online: true`, `Self: true`),
luego los **activos**, luego los **inactivos**.

**La fuente de verdad es doble**:
1. `getMiembros()` → directorio persistente en SQLite (nombre + avatar).
2. `onlineSet` → quién está conectado ahora mismo.

**Por qué `onlineSet` y el directorio están separados**: el directorio debe
sobrevivir a los reinicios (para reconocer a un amigo aunque esté desconectado),
pero la presencia es efímera.

**El bloque final con `SELECT nombre FROM usuario`**: recupera nombres de
usuarios queZY aparecieron en mensajes antiguos pero nunca se registraron en
la tabla `miembro`. Es una red de seguridad para que la lista no esté vacía.

### `GetChannelInfo() ChannelInfo` / `SetChannelInfo(nombre, subtitulo, icono)`

`GetChannelInfo` lee de la BD. `SetChannelInfo` escribe, cambia el título de
la ventana y —**solo si eres el anfitrión**— lo reparte a los peers.

**Por qué solo el anfitrión**: la identidad del canal es del anfitrión. Si
todos la cambiaran, habría conflictos. El anfitrión la difunde y el resto la
adopta (ver el paquete `channel` en `handlePacket`).

### `SetChannelIconFromDialog() string`

Abre el selector de archivos, optimiza la imagen a WebP (64 px, 100 KB) y la
establece como ícono del canal. Devuelve el data URL para previsualizarlo.

**Por qué 64 px y 100 KB**: es un ícono pequeño que se replica a todos los
peers; no tiene sentido pesar más.

## El patrón del lock en detalle

Casi todos los métodos de este archivo usan esta forma:

```go
a.mu.Lock()
dato := a.campo          // copiar el valor
sesiones := copiar el mapa
a.mu.Unlock()            // <-- liberar ANTES del trabajo lento

// aquí: disco, red, o CPU
```

**Por qué es importante** (y por qué importa que sea consistente):

1. **Evita el panic de "concurrent map iteration and map write"**: si un hilo
   itera `a.peers` mientras otro lo modifica, Go entra en panic.
2. **Evita el deadlock**: si `SetUsername` tomara el lock y llamara a
   `broadcastHello`, que a su vez toma el lock → deadlock inmediato. Go los
   mutex no son reentrantes.
3. **No bloquea la UI**: una operación de disco no debería congelar los
   clicks.

La regla: **el lock protege memoria, nunca I/O**.
