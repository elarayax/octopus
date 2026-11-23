# `audio.go` — Volúmenes y envío de voz

117 líneas. Dos responsabilidades: recordar los volúmenes configurados por el
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
// `Code` identifica al hablante cuando el audio viaja reenviado por el host
pkt := Packet{
    Type:   "audio",
    Sender: currentUser,
    Audio:  audioB64,
    Code:   a.myCode,
}
data, err := json.Marshal(pkt)
str := string(data)

sent, dropped := 0, 0
for _, s := range sessions {
    // Preferir el canal de audio (no fiable, baja latencia)
    ch := s.dca
    if ch == nil || ch.ReadyState() != webrtc.DataChannelStateOpen {
        ch = s.dc      // respaldo: el canal de chat
    }
    if ch == nil || ch.ReadyState() != webrtc.DataChannelStateOpen {
        continue
    }
    // Backpressure: si el canal va atrasado, el chunk ya es viejo
    if ch.BufferedAmount() > maxAudioBuffered {
        dropped++
        continue
    }
    if err := ch.SendText(str); err != nil {
        dropped++
        continue
    }
    sent++
}

if sent == 0 && dropped > 0 { return "DROP_ALL" }
if dropped > 0              { return "DROP" }
if sent == 0                { return "No peers" }
return "OK"
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
runtime.EventsEmit("receive_audio", code, pkt.Audio)
    ↓
El frontend lo decodifica y lo reproduce
```

**Por qué el fallback al canal `chat`**: si el canal de audio no está abierto
todavía (o se perdió), el audio se envía por el canal fiable para que no se
pierda. Es peor en latencia, pero mejor que perderlo.

**Ojo con el fallback cuando hay congestión**: si el canal de audio está
abierto pero va atrasado, **no** se cae al canal de chat. Meterse en una cola
todavía más cargada (la del chat, que es fiable y ordenada) empeoraría el
retraso. En ese caso se descarta el chunk.

**Por qué `Packet` con `Sender`**: el frontend necesita saber a quién pertenece
la voz para mostrar un indicador de "hablando".

**Por qué además `Code`**: `Sender` es el nombre de usuario (cambia, y es lo
que muestra la UI), mientras que `Code` es la identidad fija. El campo es
**imprescindible en el relay**: el host reenvía el audio a los demás, y sin
`Code` el receptor atribuiría esa voz al peer directo (el host). Con dos
hablantes en el mismo búfer, la voz volvería a sonar robótica. Ver
[bug #10](11-bugs-corregidos.md#10-voz-robótica-con-3-personas).

**Por qué el return distingue `DROP`/`DROP_ALL`**: el frontend registra esas
devoluciones (rate-limited en la consola) para poder separar un problema de
**envío** (congestión del canal) de uno de **reproducción** (búfer). Sin esa
señal, "suena robótico" no dice de qué lado viene.

## Backpressure: descartar en vez de acumular

```go
const maxAudioBuffered = 32 * 1024 // ~700 ms a 45 KB/s
```

**El problema que resuelve**: los envíos de pion/WebRTC **no bloquean**. Cada
`SendText` empuja el mensaje a una cola SCTP que no tiene límite. Si el enlace
va más lento que el micrófono, la cola crece y crece: el receptor recibe el
audio segundos tarde, lo descarta por viejo y solo se oyen fragmentos. El
síntoma típico es "no se me escucha" cuando en realidad el audio sí sale, pero
llega tarde.

**Por qué `BufferedAmount()`**: es lo que queda por confirmar en ese canal
(pendiente + en vuelo). Si supera ~700 ms de audio, el chunk nuevo ya no sirve
para conversar. Perder 32 ms de voz es preferible a arrastrar medio segundo de
retraso.

**Por qué 32 KB y no 8 KB**: `BufferedAmount` incluye lo enviado pero aún no
confirmado, así que siempre hay un suelo de `tasa × RTT`. Ese suelo **crece
con el número de streams**: el canal hacia un peer lleva el audio propio más
el reenviado del otro (≈90 KB/s en el host con 3 personas), y a 200 ms de RTT
ya son ~18 KB. Con el umbral de 8 KB el suelo se superaba en cada ida y
vuelta y se descartaban chunks **sin congestión real** → cortes periódicos de
32 ms → voz robótica. 32 KB cubre el suelo con margen y solo salta cuando el
enlace de verdad no da abasto.

**El retaso acotado real lo fija el video**, no este umbral: el video se
descarta mucho antes (`maxVideoBuffered`), así que la cola de la asociación
queda corta y la voz no arrastra segundos.

**El mismo criterio se aplica al video** (`video.go`, `maxVideoBuffered`),
porque audio y video comparten la misma asociación SCTP: un frame grande
encolado delante de la voz la retrasa igual que si fuera audio. Ver
[bug #9](11-bugs-corregidos.md#9-la-voz-llega-tarde-o-no-se-oye-head-of-line-blocking).

## El muestreo: nunca asumir 16 kHz

```
AudioContext (puede correr a 48 kHz aunque se pidan 16)
    ↓ bloque de N muestras a ctx.sampleRate
resample(bloque)          ← createResampler(ctx.sampleRate)
    ↓ 512 muestras exactas a 16 kHz
SendAudio(base64)
```

**Por qué no basta con `new AudioContext({ sampleRate: 16000 })`**: la spec
permite ignorarlo o lanzar `NotSupportedError`. WKWebView (macOS) suele
quedarse con la tasa del hardware (44.1/48 kHz). Si esos bloques se envían
como si ya fueran de 16 kHz, el receptor los reproduce 3× más lentos y su cola
crece 3× más rápido de lo que se vacía → voz grave, entrecortada y con retraso
creciente.

**Por qué un filtro de caja**: cada muestra de salida es la media de las
muestras de entrada de su periodo. Al bajar de 48 a 16 kHz hay que quitar
antes las frecuencias > 8 kHz, o se pliegan sobre la voz (aliasing). La media
es un paso-bajo barato y suficiente para voz.

**Por qué se acumula hasta 512 muestras**: a 48 kHz, un bloque de 512 muestras
de entrada solo produce ~170 de salida. Acumularlas y enviar bloques de 512
(32 ms) mantiene un ritmo constante de ~31 envíos/s, independiente de la tasa
del contexto.

## El AudioWorklet del micrófono

`frontend/public/mic-processor.js` corre en el hilo de audio (no en el de
React) y hace el remuestreo y el troceado. Si `addModule` falla, se cae al
`ScriptProcessor` (obsoleto) **aplicando el mismo remuestreo en JS**: el
resultado tiene que ser idéntico, o el bug del muestreo vuelve.

## El búfer de reproducción (jitter buffer)

`useAudioPlayback` programa cada bloque con `BufferSource.start(nextTime)`.
**La clave es que `nextTime` es por hablante**: hay un `Map<código, búfer>`
en vez de un único reloj compartido.

```
receive_audio(código, base64)
    ↓
buf = bufsRef.get(código)   ← un búfer por hablante
    ↓
buf.nextTime = ...           ← el reloj de ESE hablante
```

- `nextTime` empieza en `now + 30 ms` (margen para el primero).
- Si `nextTime` se quedó atrás (pérdida, silencio o pausa larga), se
  reengancha a `now + 30 ms`.
- Si `nextTime` supera `MAX_LATENCY` (180 ms), se **descarta el bloque
  nuevo** y no se toca lo ya agendado. Lo agendado suena seguido; descartarlo
  crearía un hueco de 32 ms con ritmo fijo (ese era el zumbido robótico).
- Si supera `HARD_RESET` (500 ms) —algo fue muy mal, p. ej. el hilo principal
  se bloqueó varios segundos— se vacía ese búfer y se reengancha. Aquí sí
  conviene aceptar el hueco.
- El `AudioBuffer` se declara siempre a 16 kHz: el navegador lo remuestrea a
  la tasa real del contexto al reproducirlo.
- Al irse un peer (`voice_peer_left` / `peer_disconnected`) su búfer se
  elimina, para no heredar atraso si vuelve con el mismo código.

**Por qué un búfer por hablante y no uno solo**: cada emisor manda 32 ms de
audio cada 32 ms. Con **una** fuente remota eso es tiempo real y un único
búfer basta. Con **dos** (3 personas) el receptor recibe el doble de lo que
puede sonar: la cola crece 32 ms por cada 32 ms reales y en ~5 bloques toca
el umbral → se vacía y se llena en bucle → se descarta **la mitad del audio**
a ritmo fijo. La simulación lo confirma:

| | Búfer único | Búfer por hablante |
|---|---|---|
| Bloques llegados (10 s, 2 emisores) | 625 | 625 |
| Bloques descartados | **308 (≈50 %)** | **0** |
| Retraso en régimen | 190 ms (fijo, sobre el umbral) | 62 / 46 ms |

Con dos personas (una fuente remota) el búfer único funcionaba; por eso el
solo se rompía a partir de tres. Ver
[bug #10](11-bugs-corregidos.md#10-voz-robótica-con-3-personas).

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
if ch == nil || ch.ReadyState() != webrtc.DataChannelStateOpen {
    continue
}
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

**El mismo patrón se aplicó al relay del host** (`setupDataChannel`): antes
copiaba los peers y **enviaba dentro** del lock, así que cada mensaje
reenviado bloqueaba `SendAudio` y `SendVideo`. Ahora copia la lista, suelta
el lock y envía fuera.
