# `audio.go` — Volúmenes y envío de voz

71 líneas. Dos responsabilidades: recordar los volúmenes configurados por el
usuario, y enviar los chunks de audio a los peers.

## `AudioPrefs`

```go
type AudioPrefs struct {
    MicGain      float64 `json:"micGain"`
    PlaybackGain float64 `json:"playbackGain"`
}
```

**Por qué `1.0` = 100%**: es la convención de `AudioContext.gainNode`. El
frontend usa el mismo valor para el nodo de Web Audio, así que no hay
traducción.

## `SetAudioPrefs(micGain, playbackGain float64)`

```go
a.saveSetting("mic_gain", strconv.FormatFloat(micGain, 'f', -1, 64))
a.saveSetting("playback_gain", strconv.FormatFloat(playbackGain, 'f', -1, 64))
```

**Por qué se guardan en la tabla `configuracion`**: son preferencias de la
UI, no datos del chat. La tabla es clave/valor genérica.

**Por qué `FormatFloat(micGain, 'f', -1, 64)`**: el flag `-1` con `'f'` usa
la **representación más corta** que representa el float exactamente. Es decir,
`0.5` → `"0.5"` (no `"0.500000"`), y `0.30000000000000004` → `"0.3"`.

**Por qué el bit de precisión `64`**: `float64` tiene 64 bits de mantisa. Sin
este parámetro, el valor se truncaría a 32 bits y habría pérdida de precisión
irrelevante pero innecesaria.

**Por qué el formato `'f'` (no `'e'` exponencial)**: `1e-07` es un valor
válido pero poco legible; con `'f'` se lee `0.0000001`.

## `GetAudioPrefs() AudioPrefs`

```go
prefs := AudioPrefs{MicGain: 1, PlaybackGain: 1}
if v, err := strconv.ParseFloat(a.getSetting("mic_gain"), 64); err == nil {
    prefs.MicGain = v
}
```

**Por qué el default `1`**: 100% de volumen. Si nunca se configuró nada, el
audio debe sonar normal.

**Por qué el `err == nil` en cada parseo**: si el valor guardado está
corrupto (o no existe), se conserva el default en vez de dejar el volumen en
0 (que sería silencio).

## `SendAudio(audioB64 string) string`

```go
pkt := Packet{
    Type:   "audio",
    Sender: currentUser,
    Audio:  audioB64,
}
data, err := json.Marshal(pkt)
str := string(data)

for _, s := range sessions {
    // Preferir el canal de audio (no fiable, baja latencia)
    ch := s.dca
    if ch == nil || ch.ReadyState() != webrtc.DataChannelStateOpen {
        ch = s.dc      // respaldo: el canal de chat
    }
    if ch != nil && ch.ReadyState() == webrtc.DataChannelStateOpen {
        ch.SendText(str)
    }
}
```

**El flujo completo del audio**:

```
Micrófono (Web Audio API en el navegador)
    ↓ captura PCM en chunks
    ↓ se convierte a base64 en el frontend
SendAudio(base64)              ← este método
    ↓
DataChannel "audio"             ← no fiable, sin orden
    ↓ red
Peer remoto: handlePacket("audio")
    ↓
runtime.EventsEmit("receive_audio", pkt.Audio)
    ↓
El frontend lo decodifica y lo reproduce
```

**Por qué el fallback al canal `chat`**: si el canal de audio no está abierto
todavía (o se perdió), el audio se envía por el canal fiable para que no se
pierda. Es peor en latencia, pero mejor que perderlo.

**Por qué `Packet` con `Sender`**: el frontend necesita saber a quién pertenece
la voz para mostrar un indicador de "hablando".

**Por qué el return es "OK"/"No peers"/"Error"**: la UI lo muestra como
notificación. Es un string porque Wails_bindings serializan strings
simplemente.

## Detalles que conviene saber

### Por qué el audio no se reenvía por el canal fiable

Ya está explicado en [webrtc.md](04-webrtc.md#por-qué-2-datachannels), pero
conviene repetirlo porque es la decisión de diseño más importante de este
archivo:

```
Canal "chat":  maxRetransmits=nil  → fiable + ordenado
Canal "audio": maxRetransmits=0    → no fiable + sin orden
```

Con un canal fiable, si un paquete se pierde, el protocolo lo reenvía. Para
voz en vivo eso significa esperar un timeout (cientos de ms) → el audio se
desincroniza y se acumula jitter. Es preferible perder 20 ms de voz.

### Por qué el `ReadyState` se comprueba dos veces

```go
ch := s.dca
if ch == nil || ch.ReadyState() != webrtc.DataChannelStateOpen {
    ch = s.dc
}
if ch != nil && ch.ReadyState() == webrtc.DataChannelStateOpen {
```

La primera comprobación decide **cuál** canal usar; la segunda verifica que
el canal elegido esté realmente listo. Sin la segunda, `SendText` fallaría
en un canal cerrado.

### Por qué se copia la lista de sesiones antes de enviar

```go
a.mu.Lock()
sessions := make([]*PeerSession, 0, len(a.peers))
for _, s := range a.peers { sessions = append(sessions, s) }
a.mu.Unlock()
```

El envío es I/O de red. Si se hiciera con el lock tomado, un peer lento
bloquearía toda la app (y podría hacer deadlock si durante el envío otro
hilo quisiera el mismo lock).
