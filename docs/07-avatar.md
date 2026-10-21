# `avatar.go` — Avatares e imágenes optimizadas a WebP

282 líneas. Todo lo que transforma una imagen arbitraria (PNG, JPG, GIF, WebP)
en un WebP compacto, y su difusión por la red.

## Los límites

```go
const (
    avatarMaxDim      = 128        // px, lado máximo del avatar
    avatarMaxBytes    = 300 * 1024 // tope del avatar (~300 KB)
    chatImageMaxDim   = 800        // px, lado máximo de imágenes de chat
    chatImageMaxBytes = 400 * 1024 // tope de imágenes de chat (~400 KB)
    avatarFileName    = "avatar.webp"
)
```

**Por qué hay dos juegos de límites**: el avatar se replica a **todos** los
peers en cada conexión (es pequeño, 128 px, ~300 KB). Una imagen de chat es
un mensaje puntual (800 px, 400 KB).

**Por qué WebP y no PNG/JPEG**:

| Formato | Con alpha | Animado | Tamaño típico (128px) |
|---------|-----------|---------|----------------------|
| PNG | sí | no | grande |
| JPEG | no | no | medio |
| **WebP** | **sí** | **sí** | **pequeño** |

WebP cubre los tres casos con un solo formato. Además es el formato que
pion/WebRTC y los navegadores manejan sin problemas.

**Por qué el tope de bytes además del de dimensiones**: las dimensiones
controlan el área, pero no el tamaño final (una foto con mucho detalle
comprime peor). El tope de bytes garantiza que el DataChannel no se atrase.

## `avatarPath() (string, error)`

```go
configDir := filepath.Join(homeDir, ".chat_p2p")
os.MkdirAll(configDir, 0700)
return filepath.Join(configDir, avatarFileName), nil
```

**Por qué `0700`**: el directorio contiene la clave privada (`identity.key`) y
el avatar. Solo el usuario debe poder leerlo.

## `resizeToMax(src image.Image, maxDim int) *image.NRGBA`

```go
b := src.Bounds()
w, h := b.Dx(), b.Dy()
if w > maxDim || h > maxDim {
    ratio := float64(maxDim) / float64(w)
    if h > w {
        ratio = float64(maxDim) / float64(h)
    }
    w = int(float64(w)*ratio + 0.5)
    h = int(float64(h)*ratio + 0.5)
    if w < 1 { w = 1 }
    if h < 1 { h = 1 }
}
dst := image.NewNRGBA(image.Rect(0, 0, w, h))
xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, b, xdraw.Over, nil)
return dst
```

**Qué hace**: escala la imagen para que su lado mayor no supere `maxDim`,
**manteniendo la proporción** (¡no la deforma!).

**Por qué `NRGBA`**: es el formato de píxel más versátil de la librería
estándar (no premultiplicado), con soporte de canal alfa. El WebP necesita
alfa real.

**Por qué `CatmullRom`**: es el algoritmo de reescalado de **alta calidad** de
`golang.org/x/image/draw`. Con nearest-neighbour (el más rápido) las fotos
parecen Pixel Art. CatmullRom es un filtro bicúbico suavizado.

**Por qué el `+ 0.5`**: redondeo al entero más cercano (en vez de truncar,
que perdería un píxel de media).

**Por qué `if w < 1 { w = 1 }`**: una imagen extremely panorámica (por ejemplo
2000×3) podría dar `w = 0`, y un `image.Rect` de ancho 0 es inválido y
haría panic en el encoder.

**Por qué `xdraw.Over`**: al escalar, los bordes semi-transparentes se
componen con `Over` (source over) en vez de `Src` (que ignoraría el alfa).

## `processStaticImage(img image.Image, maxDim int) ([]byte, error)`

```go
resized := resizeToMax(img, maxDim)
var buf bytes.Buffer
webp.Encode(&buf, resized, &webp.Options{CompressionLevel: webp.DefaultCompression})
return buf.Bytes(), nil
```

**Por qué `DefaultCompression`**: el balance por defecto de la librería es
bueno. Subirlo costaría CPU (¡y el usuario está esperando!) por pocos bytes.

## `gifToFrames(g *gif.GIF) ([]image.Image, []uint)`

```go
canvas := image.NewNRGBA(image.Rect(0, 0, w, h))
for i, frame := range g.Image {
    // Guardamos el lienzo por si el frame declara "disposal = previous" (3)
    var previo *image.NRGBA
    disposal := byte(gif.DisposalNone)
    if i < len(g.Disposal) {
        disposal = g.Disposal[i]
    }
    if disposal == gif.DisposalPrevious {
        previo = image.NewNRGBA(canvas.Bounds())
        copy(previo.Pix, canvas.Pix)
    }

    draw.Draw(canvas, frame.Bounds(), frame, frame.Bounds().Min, draw.Over)

    snap := image.NewNRGBA(canvas.Bounds())
    copy(snap.Pix, canvas.Pix)
    frames = append(frames, snap)

    delayMs := uint(g.Delay[i] * 10)
    if delayMs == 0 { delayMs = 100 }
    durations = append(durations, delayMs)

    switch disposal {
    case gif.DisposalBackground:
        draw.Draw(canvas, frame.Bounds(), image.Transparent, image.Point{}, draw.Src)
    case gif.DisposalPrevious:
        if previo != nil {
            copy(canvas.Pix, previo.Pix)
        }
    }
}
```

**El problema que resuelve**: en un GIF, cada frame es un **sub-rectángulo**
sobre un lienzo completo, y puede tener transparencia. Para convertirlo a WebP
animado hay que componer cada frame sobre el lienzo.

**Por qué se copia el lienzo (`snap`)**: los frames del GIF se dibujan
*encima* del anterior. Si se guardara la referencia al mismo `canvas`, todos
los frames serían iguales (el último). La copia `copy(snap.Pix, canvas.Pix)` es
un snapshot real.

**Por qué `g.Delay[i] * 10`**: en GIF, el delay está en **centésimas de
segundo**; WebP usa **milisegundos**. 10 centésimas = 100 ms.

**Por qué `delayMs == 0 → 100`**: algunos GIFs tienen delay 0 (que en el
browser significa "tan rápido como sea posible", un problema de CPU). Poner
un mínimo de 100 ms evita eso.

**Los tres métodos de disposal del GIF**:

| Valor | Nombre | Qué pasa con el lienzo tras mostrar el frame |
|-------|--------|---------------------------------------------|
| 0 | `DisposalNone` | no se toca (el frame anterior sigue debajo) |
| 1 | `DisposalUnspecified` | igual que 0 |
| 2 | `DisposalBackground` | se limpia el rectángulo del frame a transparente |
| 3 | `DisposalPrevious` | se restaura el lienzo **tal como estaba antes** de este frame |

**Por qué el caso 3 necesita una copia previa**: para "deshacer" el frame hay
que tener el estado anterior guardado. Por eso se clona el lienzo **antes**
de dibujar (`previo`) y se restaura después de la instantánea.

**Por qué el `disposal` se lee con cuidado**: `g.Disposal` puede tener menos
elementos que `g.Image` (GIFs mal formados). Por eso se lee con
`if i < len(g.Disposal)` y se usa `DisposalNone` por defecto.

**Por qué la limpieza va DESPUÉS de la instantánea**: el frame guardado debe
incluir el contenido actual; el clearance describe qué pasa con el lienzo
*para el siguiente* frame.

## `encodeAnimatedWebP(frames, durations, loopCount, maxDim, maxBytes) ([]byte, error)`

Codifica la animación degradando progresivamente si no cabe en el presupuesto:

```
1. codificar a maxDim
   ↓ si > maxBytes
2. reducir a la mitad de frames (duplicando su duración)
   ↓ si > maxBytes
3. achicar el lienzo a 64 px y reintentar
   ↓ si > maxBytes
4. devolver el último resultado (aunque no quepa)
```

**Por qué duplicar la duración al quitar frames**: si quitas el frame 1 de
una animación de 100 ms + 100 ms, el resultado debe seguir durando 200 ms. Si
simplemente lo eliminas, la animación se acelera.

**Por qué 64 px como último recurso**: es el tamaño de un avatar pequeño. Es
el punto donde seguir reduciendo no tiene sentido.

**Por qué devolver el mejor resultado aunque no quepa**: mejor una imagen
ligeramente más grande que un error.

### El detalle crítico: `Disposals`

```go
disposals := make([]uint, len(fr))
for i := range disposals {
    disposals[i] = 1   // 1 = "clear to background"
}

webp.EncodeAll(&buf, &webp.Animation{
    Images:    resized,
    Durations: du,
    Disposals: disposals,
    LoopCount: loopCount,
}, ...)
```

**Este es el fix del bug de "residuos"** (ver
[Bugs corregidos](11-bugs-corregidos.md#8-residuos-fantasmas-en-los-gifs-con-fondo-transparente)).

**Por qué `1` y no `0`**: en una animación WebP, cada frame se dibuja sobre el
canvas que dejó el frame anterior:

- `Disposals = 0` (**"none"**) → el canvas **no se limpia** y el frame nuevo se
  **mezcla** encima. Las zonas transparentes del frame nuevo dejan ver el
  contenido del frame viejo → **fantasmas**.
- `Disposals = 1` (**"background"**) → tras mostrar el frame, su área se
  limpia a transparente. Cada frame se dibuja sobre un lienzo limpio.

Como nuestros frames son **instantáneas completas** del lienzo GIF ya
compuesto, la semántica correcta es "background": cada frame es independiente.

**Cómo se verificó**: `webpmux -info` sobre el archivo generado muestra la
columna `dispose`:

```
  1:    64    64   yes   0   0   120   background   yes   448   lossless
```

Y el byte de flags del chunk `ANMF` pasa de `0x00` a `0x01` — exactamente lo
que produce la propia referencia de libwebp.

## `processImage(data []byte, maxDim, maxBytes int) ([]byte, error)`

El punto de entrada. Detecta el formato:

```go
if bytes.HasPrefix(data, []byte("GIF8")) {
    g, err := gif.DecodeAll(...)
    if len(g.Image) == 1 {
        return processStaticImage(g.Image[0], maxDim)   // GIF de 1 frame = estático
    }
    frames, durations := gifToFrames(g)
    loop := uint16(0)
    if g.LoopCount > 0 { loop = uint16(g.LoopCount) }
    else if g.LoopCount < 0 { loop = 1 }               // -1 = infinito
    return encodeAnimatedWebP(frames, durations, loop, maxDim, maxBytes)
}

img, _, err := image.Decode(...)
if err != nil {
    // quizá sea un WebP de entrada
    if img2, err2 := webp.Decode(...); err2 == nil { img = img2 }
    else { return nil, fmt.Errorf("formato de imagen no soportado: %w", err) }
}
return processStaticImage(img, maxDim)
```

**Por qué `bytes.HasPrefix(data, []byte("GIF8"))`**: la firma del GIF es
literalmente `"GIF8"` (version 87a/89a). Es la forma más barata de detectarlo
sin decodificar.

**Por qué un GIF de 1 frame se trata como estático**: es una imagen con
animación no aporta nada; WebP animado para un frame es solo complejidad.

**Por qué `loop = 1` cuando `LoopCount < 0`**: en el formato GIF, `-1`
significa "loop infinito". WebP usa `0` para infinito y `n` para n
repeticiones. La conversión es: `0` (no repetir) → `0`; `-1` (infinito) →
`1` (que en WebP significa "repetir para siempre" según la librería);
`n > 0` → `n`.

**Por qué los imports con `_`**: `_ "image/jpeg"` y `_ "image/png"` registran
los decodificadores en el registro global de `image` sin usar el paquete
directamente. `image.Decode` los encuentra ahí. **Sin esos imports, un JPEG
daría "formato no soportado"**.

## `avatarDataURL() string`

```go
data, err := os.ReadFile(path)
if err != nil || len(data) == 0 { return "" }
return "data:image/webp;base64," + base64.StdEncoding.EncodeToString(data)
```

**Por qué devuelve "" si no hay avatar**: la UI puede distinguir "sin avatar"
de "avatar vacío" y mostrar la inicial del nombre.

**Por qué base64 y no la ruta del archivo**: el avatar tiene que viajar por
la red (a los peers) y mostrarse en la UI. La data URL sirve para ambas cosas.

## `GetAvatar() string`

Simplemente llama a `avatarDataURL()`. Existe como método público para que
la UI lo invoque directamente.

## `SetAvatarFromDialog() string`

```go
path, err := runtime.OpenFileDialog(a.ctx, ...)   // "" si se cancela
data, err := os.ReadFile(path)
optimized, err := processImage(data, avatarMaxDim, avatarMaxBytes)
os.WriteFile(dst, optimized, 0600)
a.broadcastAvatar()
return a.avatarDataURL()
```

**Por qué devuelve el data URL**: la UI lo usa para previsualizar el avatar
nuevo sin releer el archivo.

**Por qué `""` en cancelado vs `"Error: ..."`**: la UI distingue "canceló"
(silencio) de "falló" (mostrar error).

**Por qué `broadcastAvatar()`**: los peers conectados deben ver la foto nueva
sin reconectarse.

**Por qué `0600`**: el archivo es del usuario.

## `broadcastAvatar()` y `sendAvatarTo(dc)`

```go
func (a *App) sendAvatarTo(dc *webrtc.DataChannel) {
    data, err := os.ReadFile(path)
    if err != nil || len(data) == 0 { return }
    a.mu.Lock()
    pkt := Packet{Type: "avatar", Sender: a.username, Code: a.myCode,
                  Avatar: base64.StdEncoding.EncodeToString(data)}
    a.mu.Unlock()
    raw, err := json.Marshal(pkt)
    if err == nil { dc.SendText(string(raw)) }
}
```

**Por qué releer el archivo en cada envío**: es un archivo de 300 KB; leerlo
una vez y cachearlo en memoria sería más rápido, pero complica la
sincronización cuando el usuario cambia la foto. Leer es simple y siempre
correcto.

**Por qué el lock solo para armar el `Packet`**: `a.username` y `a.myCode` son
los únicos datos compartidos que se leen. El trabajo pesado (leer, codificar)
queda fuera del lock.

## Nota de rendimiento

`processImage` puede tardar cientos de milisegundos (decodificar un GIF de
100 frames, reescalar, codificar WebP). Esto pasa en el hilo de la UI de
Wails, lo que puede congelar la ventana un instante.

**Por qué es aceptable**: ocurre una vez, cuando el usuario elige una
imagen. El usuario ya está esperando el resultado. El resto del chat sigue
funcionando porque Wails ejecuta los bindings en goroutines separadas.
