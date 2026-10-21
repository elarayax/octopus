# `chat_image.go` — Envío de imágenes al chat

76 líneas. Es el camino corto para enviar una imagen como mensaje.

## `SendImageFromDialog() string`

El flujo completo:

```
1. runtime.OpenFileDialog()        ← selector de archivos nativo
2. os.ReadFile(path)                ← leer el archivo
3. processImage(data, 800, 400KB)  ← optimizar a WebP (reutiliza avatar.go)
4. base64.StdEncoding.EncodeToString(optimized)
5. Packet{Type: "image", Sender, Code, Image: b64}
6. dc.SendText(...)  a cada peer    ← enviar
7. saveMessageKind(...)            ← guardar en el historial local
8. runtime.EventsEmit("receive_message", ...)  ← mostrar en la propia pantalla
9. return "Enviado"
```

### Los valores de retorno

| Valor | Significado | Qué hace la UI |
|-------|-------------|----------------|
| `""` | el usuario canceló | no muestra nada |
| `"Enviado"` | todo bien | toast de éxito |
| `"Error: ..."` | falló | toast de error |

**Por qué un string y no un objeto**: los bindings de Wails serializan
strings sin complicación, y el frontend solo necesita el texto para el toast.

### Por qué reutiliza `processImage` de `avatar.go`

```go
optimized, err := processImage(data, chatImageMaxDim, chatImageMaxBytes)
```

**El "por qué"**: la lógica de optimización (WebP estático/animado, GIF
compositado, degradación de tamaño) es **compleja y ya está escrita**.
Duplicarla sería una fuente de bugs. El único cambio son los parámetros:

| | Avatar | Imagen de chat |
|---|---|---|
| `maxDim` | 128 px | 800 px |
| `maxBytes` | 300 KB | 400 KB |

La imagen de chat es más grande porque se ve a tamaño real en el historial;
el avatar es una miniatura.

### Por qué se comprueba que haya peers

```go
if len(sessions) == 0 {
    return "Error: No hay ningún peer conectado actualmente"
}
```

**Por qué antes de codificar**: no tiene sentido codificar una imagen de
800×600 para nobody. Se comprueba **primero** para ahorrar CPU.

### Por qué se cuenta los envíos

```go
sent := 0
for _, s := range sessions {
    if s.dc != nil && s.dc.ReadyState() == webrtc.DataChannelStateOpen {
        if err := s.dc.SendText(string(raw)); err == nil { sent++ }
    }
}
if sent == 0 {
    return "Error: No se pudo enviar la imagen a los peers conectados"
}
```

**Por qué `sent == 0` es un error**: puede haber peers registrados pero con
el DataChannel cerrado (conexión caída justo entonces). El `sent` real es la
única medida fiable.

### Por qué se guarda y se emite localmente

```go
a.saveMessageKind(currentUser, b64, "image", "")
runtime.EventsEmit(a.ctx, "receive_message", Message{
    Sender: currentUser,
    Kind:   "image",
    Image:  "data:image/webp;base64," + b64,
})
```

**El mismo patrón que en `SendMessage`**: la imagen no vuelve por la red (no
hay eco). Para que aparezca en pantalla igual que las ajenas, se guarda en
la BD y se emite el evento local. Así hay **un solo camino de renderizado**.

**Por qué `Kind: "image"`**: la UI usa ese campo para elegir entre renderizar
texto o una etiqueta `<img>`.

**Por qué se guarda la base64 (no el WebP binario)**: la columna `contenido`
es TEXT y ya contiene la base64. Así el historial se puede exportar y
sincronizar sin transformaciones.

### Por qué `Code: a.myCode`

```go
pkt := Packet{Type: "image", Sender: currentUser, Code: a.myCode, Image: b64}
```

El `Code` identifica al autor de forma **única** (el nombre puede estar
repetido). El receptor lo usa para la deduplicación del historial y para la
presencia.

## Detalle: por qué el canal de audio no se usa aquí

Las imágenes van **siempre** por el canal `chat` (fiable y ordenado). Tiene
sentido: una imagen a medias no sirve de nada, y el tamaño está dentro del
tope de SCTP de 4 MB.

El canal de audio existe solo para la voz, donde la latencia manda más que
la integridad.
