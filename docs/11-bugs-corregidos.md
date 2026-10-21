# Bugs corregidos — el registro forense

Documento de referencia: qué fallaba, cómo se manifestaba, cómo se
diagnosticó y qué se cambió. **Estos casos son reutilizables**: la mayoría
son errores de escritorio que aparecen en cualquier app Go + Wails + WebRTC.

---

## 1. `Unsolicited response received on idle HTTP channel`

### Síntoma

```
2026/10/20 22:06:07 Unsolicited response received on idle HTTP channel
starting with "HTTP/1.1 400 Bad Request\r\n\r\n"; err=<nil>
```

Aparecía en la terminal de `wails dev`, justo al intentar conectar.

### De dónde viene

No es un error de la app: es un `log.Printf` de la librería estándar, en
`net/http/transport.go:2640`:

```go
func (pc *persistConn) readLoopPeekFailLocked(peekErr error) {
	if pc.closed != nil { return }
	if n := pc.br.Buffered(); n > 0 {
		buf, _ := pc.br.Peek(n)
		if is408Message(buf) {
			pc.closeLocked(errServerClosedIdle)
			return
		} else {
			log.Printf("Unsolicited response received on idle HTTP channel starting with %q; err=%v", buf, peekErr)
		}
	}
	...
}
```

**Traducción**: el `readLoop` de una conexión HTTP/1.1 estaba **ocioso**
(esperando la siguiente respuesta: `numExpectedResponses == 0`) y llegaron
bytes inesperados.

### La secuencia exacta

```
1. Go envía la oferta por una conexión del pool keep-alive
2. La respuesta llega bien → la conexión vuelve al pool ocioso
3. Vercel/edge ya había decidido cerrar esa conexión
4. El edge recibe los bytes de la oferta sobre una conexión que cierra
   → responde "HTTP/1.1 400 Bad Request" (sin cuerpo, sin headers)
5. Go, que ya la tenía en su pool como ociosa, hace peek:
   "¡hay bytes que no espero!" → loguea el error
```

**Pista clave**: el `400` **no tenía cuerpo**. Los errores de la API de
Vercel sí devuelven JSON (`{"error":"Faltan parámetros..."}`). Un 400 vacío
lo genera la capa edge/proxy, no la función.

### Por qué el fix del autor original no bastaba

El commit `96aebf4 "reparado?"` creó `vercelClient` (sin keep-alives) y lo
aplicó **solo al GET del polling**:

| Ruta | Cliente | Keep-alives |
|------|---------|-------------|
| `pollMailbox` → GET | `vercelClient` | desactivados ✅ |
| `sendSignal` → **POST** | `http.Post` (default) | **activados** ❌ |

`sendSignal` es justamente lo que se ejecuta "al tratar de conectarme"
(`ConnectToPeer` → `sendSignal` → `http.Post`). El error siguió apareciendo
porque la mitad del problema seguía sin tocarse.

### El fix

```go
// webrtc.go
resp, err := vercelClient.Post(VERCEL_URL, "application/json", bytes.NewBuffer(data))
```

**Por qué funciona**: sin keep-alives no existe "canal ocioso" al que
reutilizar una conexión Closada → la condición `numExpectedResponses == 0`
con bytes pendientes nunca se da.

### Nota sobre HTTP/2

El error **solo** puede venir del camino HTTP/1.1. El transporte HTTP/2 de Go
tiene su propio manejo de conexiones y nunca loguea ese mensaje. Se comprobó
con `httptrace` que ambos clientes negociaban `h2`... pero el edge de Vercel
también sirve conexiones `http/1.1` (depende del PoP y de la negociación
ALPN), y esas son las que fallan.

---

## 2. El `400` se tomaba por éxito

### Síntoma

La app decía *"Solicitud enviada a ABC123. Conectando P2P..."* y se quedaba
colgada para siempre. Sin ningún error.

### Causa

```go
// antes
resp, err := http.Post(VERCEL_URL, "application/json", bytes.NewBuffer(data))
if err != nil { return err }
_ = resp.Body.Close()
return nil      // ← el código de respuesta nunca se miraba
```

Un `400 Bad Request` (payload inválido, campo faltante) se reportaba como
`nil` = éxito.

### El fix

```go
if resp.StatusCode == http.StatusOK { return nil }

lastErr = fmt.Errorf("el servidor respondió %d: %s", resp.StatusCode, ...)

// Un 4xx (salvo 429) significa que el payload es inválido: reintentar no ayuda.
if resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != http.StatusTooManyRequests {
    return lastErr
}
```

**Verificado** con un test contra la API real:

```
el servidor respondió 400: {"error":"Faltan parámetros: to, from, type, sdp"}
```

---

## 3. `ConnectionPanel` con una prop inexistente (frontend)

### Síntoma

Al escribir un código en el campo "Pega el ID Fijo de tu amigo" y pulsar
**Conectar**: no pasaba absolutamente nada. Sin error en la terminal de Go.

### Causa

```jsx
// ChatPage.jsx (así se llama)
<ConnectionPanel connect={p2p.connect} nodeInfo={p2p.nodeInfo} />

// ConnectionPanel.jsx (así se definía)   ← el bug
export function ConnectionPanel({ onConnect }) {
  ...
  onSubmit={() => onConnect(address)}   // onConnect === undefined
}
```

`onConnect` no existe en las props → `undefined` → `TypeError: onConnect is
not a function` al hacer clic.

**El TypeError va a la consola del navegador**, no a la terminal de Go. Por eso
parecía que "no pasaba nada".

### Cómo se diagnosticó

1. El buzón de destino estaba **vacío** → la oferta nunca llegó al servidor.
2. La tabla `canal` de SQLite **no tenía fila** para ese código. Pero
   `ConnectToPeer` inserta esa fila **antes** de enviar nada → Go nunca fue
   invocado.
3. Eso descartaba la mitad del backend y apuntaba al frontend.

### El fix

```jsx
export function ConnectionPanel({ connect }) {
  ...
  onSubmit={() => connect(address)}
}
```

---

## 4. `ChannelsPanel` comparando `'IDLE'` vs `'idle'` (frontend)

### Síntoma

El botón ▶ de cada canal de la lista **no aparecía nunca**.

### Causa

```jsx
// useP2P.js define los estados en MINÚSCULAS
export const STATUS = { IDLE: 'idle', LISTENING: 'listening', ... }

// ChannelsPanel.jsx comparaba en MAYÚSCULAS
const idle = status === 'IDLE';   // siempre false
```

`StatusBar.jsx` lo hacía bien (importaba `STATUS`); `ChannelsPanel.jsx` usaba
una cadena literal.

### El fix

```jsx
import { STATUS } from '../../hooks/useP2P';

const canConnect = status !== STATUS.CONNECTING;
```

**Por qué `!== CONNECTING` y no `=== IDLE`**: el botón debe estar disponible
mientras el servidor está activo. Con `=== IDLE` solo aparecería con el
servidor detenido, y entonces `ConnectToPeer` fallaría con *"Debes iniciar el
servidor primero"*.

---

## 5. `database is locked (5) (SQLITE_BUSY)`

### Síntoma

```
upsertCanal insert err=database is locked (5) (SQLITE_BUSY) id=35
```

Cada intento de conexión fallaba al guardar el canal en la BD.

### Causa

Dos factores combinados:

**a) Sin `busy_timeout`.** SQLite no espera: si encuentra un conflicto de
lock, falla **al instante**. El driver `modernc.org/sqlite` solo aplica
`busy_timeout` si se pide en el DSN:

```go
// modernc.org/sqlite/sqlite.go
busyKey, busyTimeout := dsnPick(q, "_busy_timeout", "_timeout")
if busyTimeout != "" { ... }
```

**b) Modo `DELETE` (por defecto).** En este modo, un lector abierto bloquea
al escritor.

Y el detonante: `sql.Open("sqlite", dbPath)` abre un **pool** de varias
conexiones al mismo archivo. Una lectura (`getMiembros`, `GetCanales`…) deja
`rows` abiertos mientras otra conexión intenta escribir (`upsertCanal`).

### Reproducción

Un test de estrés con 6 goroutines leyendo (con `rows` abiertos) y
escribiendo a la vez:

```
[SIN fix]  errores totales=368  bloqueos SQLITE_BUSY=368
   ej: escritura: database is locked (5) (SQLITE_BUSY)
[CON fix]  errores totales=0    bloqueos SQLITE_BUSY=0
```

### El fix

```go
dsn := fmt.Sprintf("%s?_busy_timeout=5000&_pragma=journal_mode(WAL)"+
    "&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(1)", dbPath)
db, err := sql.Open("sqlite", dsn)
```

| Parámetro | Para qué |
|-----------|----------|
| `_busy_timeout=5000` | esperar hasta 5 s en vez de fallar al instante |
| `_pragma=journal_mode(WAL)` | en WAL, los lectores no bloquean al escritor |
| `_pragma=synchronous(NORMAL)` | más rápido y seguro con WAL |
| `_pragma=foreign_keys(1)` | se aplica en **cada** conexión del pool |

### Detalle importante: por qué NO `SetMaxOpenConns(1)`

Funciona, pero introduce un **deadlock latente**:

```
goroutine A: rows := db.Query(...)        // toma la conexión
             for rows.Next() {
                 db.Exec("INSERT ...")     // espera la conexión que A tiene
             }

goroutine B: db.Exec("INSERT ...")        // espera a que A libere
```

A espera a B y B espera a A. **Con WAL + busy_timeout ese riesgo no existe.**

### Efecto secundario positivo

El `PRAGMA foreign_keys = ON` que se ejecutaba suelto (`db.Exec`) solo
afectaba a **una** de las conexiones del pool. Las claves foráneas no se
aplicaban en el resto. Con los pragmas en el DSN, cada conexión nueva los
recibe.

### La trampa del test

El primer test de reproducción **no reproducía nada** porque la tabla estaba
vacía: `rows.Next()` devolvía `false` y el cuerpo del bucle (donde estaba la
escritura) nunca se ejecutaba. Un test que no hace lo que dice es peor que
ningún test.

---

## 6. Un falso positivo: "0 candidatos ICE"

### Síntoma (aparente)

Un test propiodulante showed **0 candidatos ICE** en el SDP → "el P2P no
puede funcionar en esta red".

### Por qué era falso

El test creaba el `PeerConnection` **sin DataChannels**:

```go
pc, _ := newPeerConnection()     // sin canales de datos
offer, _ := pc.CreateOffer(nil)
```

Sin media, pion no genera sección `m=` y **no hay nada que negociar** → no
hay gathering, no hay candidatos. El SDP resultante terminaba en
`a=extmap-allow-mixed` y ya.

### El test correcto

```go
pc, _ := newPeerConnection()
pc.CreateDataChannel("chat", nil)
pc.CreateDataChannel("audio", ...)
```

```
gathering completado en 29ms
candidatos ICE: 18
  typ host  192.168.1.8:59582
  typ srflx 190.114.44.141:14645     ← IP pública (STUN)
```

Y los 3 STUN de Google respondieron correctamente.

**Lección**: un test que reproduce a medias produce diagnósticos falsos.
Antes de culpar a la red, hay que reproducir **exactamente** el flujo real.

---

## 7. El handshake completo (la prueba de fuego)

Para demostrar que el backend funcionaba de punta a punta se escribió un test
que simula **dos peers reales** hablando por el buzón de Vercel:

```
STEP1 Solicitud enviada a E2EBBB. Conectando P2P...
STEP2 oferta recibida por B
STEP3 B genero la respuesta
STEP4 respuesta recibida por A
STEP5 A aplico la respuesta
ICE_A connecting → ICE_A connected → ICE_B connected
→ DataChannel abierto (peer_connected)
```

**El truco**: el test corre en un **subproceso** porque `runtime.EventsEmit`
hace `log.Fatalf` si el contexto no es el de Wails (el `log.Fatalf` mata el
proceso). El subproceso muere justo cuando se abre el DataChannel, y esa
muerte **es** la señal de éxito.

```
✔ signaling + WebRTC funcionan de punta a punta
```

---

## 8. Residuos (fantasmas) en los GIF con fondo transparente

### Síntoma

Al elegir un GIF animado con fondo transparente (avatar o imagen del chat), al
mostrarlo aparecen **cuadros fantasma**: el contenido de los frames anteriores
se queda visible en las zonas donde el frame actual es transparente.

```
frame 1 correcto:   [■        ]
frame 1 con residuo: [■   ■    ]     ← el cuadro de la izquierda es un fantasma
```

### Causa

En una animación WebP, cada frame se **dibuja encima** del canvas que dejó el
frame anterior, según su método de *disposal*:

| `Disposals` | Significado | Efecto |
|-------------|-------------|--------|
| `0` | none | el canvas no se limpia → el frame nuevo se mezcla encima → **fantasmas** |
| `1` | background | tras mostrar el frame, su área se limpia → cada frame es independiente |

El código pasaba **todos ceros**:

```go
webp.EncodeAll(&buf, &webp.Animation{
    Images:    resized,
    Durations: du,
    Disposals: make([]uint, len(fr)),   // ← todos 0 = "none"
    LoopCount: loopCount,
}, ...)
```

Como nuestros frames son **instantáneas completas** del lienzo GIF ya
compuesto, la semántica correcta es "background" (cada frame se dibuja sobre
un lienzo limpio).

### El fix

```go
disposals := make([]uint, len(fr))
for i := range disposals {
    disposals[i] = 1   // 1 = "clear to background"
}
```

### Cómo se diagnosticó

1. `webpmux -info` sobre el WebP generado mostraba `dispose: none` en todos
   los frames (y `blend: yes`, o sea "mezcla sobre el anterior").
2. El byte de flags del chunk `ANMF` era `0x00`; con el fix pasa a `0x01`.
3. Se comprobó contra la **referencia de libwebp**: un archivo construido con
   `webpmux -dispose background` tiene exactamente el mismo byte de flags.

### La prueba A/B

Con el mismo GIF (fondo transparente, `disposal=background`), contando los
píxeles rojos visibles de cada frame tal como los compondría un visor:

```
=== VIEJO (dispose=none) ===
   frame 0: 324 pixeles rojos
   frame 1: 648 pixeles rojos      ← el doble: el cuadro fantasma
   frame 2: 648 pixeles rojos

=== NUEVO (dispose=background) ===
   frame 0: 324 pixeles rojos
   frame 1: 324 pixeles rojos      ← correcto
   frame 2: 0 (es el frame azul)
```

### Bug secundario: `disposal = previous`

El código solo contemplaba `DisposalBackground` (2). Faltaba el
`DisposalPrevious` (3), que **deshace** el frame actual restaurando el lienzo
al estado anterior. Sin contemplarlo, esos GIFs dejaban residuos.

El fix clona el lienzo **antes** de dibujar el frame y lo restaura después si
el frame lo pide.

### Herramientas útiles para diagnosticar

```bash
# ver la tabla de frames (dispose / blend / duración)
webpmux -info animated.webp

# extraer un frame suelto
webpmux -get frame 2 animated.webp -o frame2.webp

# ver el tamaño y formato
webpinfo animated.webp

# ver una animación frame a frame
vwebp animated.webp
```

> `webpmux` viene con `libwebp` (`brew install webp`). El comando
> `webpmux -get frame 2` **no** acepta `"frame 2"` como un solo argumento:
> hay que pasar `"frame"` y `2` por separado.



| Síntoma | Dónde mirar primero | Truco |
|---------|--------------------|-------|
| Error de la librería estándar | el código de la app que la usa | `grep` el mensaje en el código de Go |
| Nada pasa al hacer clic | la consola **del navegador** | comparar los props del padre con los del hijo |
| "Se queda colgado" | la BD, la red y el estado de la UI | ver si el estado de la UI se resetea |
| Error de SQLite | el DSN y el pool | test de estrés con lecturas y escrituras simultáneas |
| Conexión que no se establece | ICE (candidatos) **y** señalización | test end-to-end con dos peers |
| Fantasmas/residuos en una animación | el método de *disposal* del archivo | `webpmux -info` y comparar con libwebp |
