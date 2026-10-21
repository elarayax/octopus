# Documentación del código Go — Chat P2P

Guía de estudio del backend. Cada archivo `.go` de la raíz tiene su propio documento
que explica **qué hace cada método** y **por qué la lógica está escrita así**.

## Orden de lectura recomendado

| # | Documento | Contenido | Dificultad |
|---|-----------|-----------|------------|
| 00 | [Este índice](00-indice.md) | Mapa del proyecto y convenciones | — |
| 01 | [Arquitectura](01-arquitectura.md) | Cómo encaja todo: flujo de datos, topología, señalización | conceptually |
| 02 | [main.go](02-main.md) | Arranque de la app de escritorio | fácil |
| 03 | [app.go](03-app.md) | Estado de la app y métodos que expone a la UI | fácil |
| 04 | [webrtc.go](04-webrtc.md) | **El corazón**: identidad, señalización, WebRTC | media |
| 05 | [db.go](05-db.md) | Persistencia en SQLite, historial, directorio | media |
| 06 | [audio.go](06-audio.md) | Volúmenes y envío de voz | fácil |
| 07 | [avatar.go](07-avatar.md) | Optimización de imágenes (WebP estático y animado) | media |
| 08 | [chat_image.go](08-chat_image.md) | Envío de imágenes por el chat | fácil |
| 09 | [mods.md](09-mods.md) | Temas y layout personalizables | fácil |
| 10 | [Frontend](10-frontend.md) | Puente Go ↔ React y los hooks que importan | fácil |
| 11 | [Bugs corregidos](11-bugs-corregidos.md) | Errores reales encontrados y por qué se rompían | — |

## Mapa rápido de archivos

```
main.go        (49 líneas)   Arranque de Wails
app.go         (319 líneas)  Estado global + API para la UI
webrtc.go      (~780 líneas) Identidad, señalización y conexiones P2P
db.go          (~470 líneas) SQLite: canales, mensajes, directorio, config
audio.go       (71 líneas)   Preferencias de audio + envío de voz
avatar.go      (282 líneas)  Avatar e imágenes optimizadas a WebP
chat_image.go  (76 líneas)   Envío de imágenes al chat
mods.go        (111 líneas)  CSS y layout personalizables
schema.sql                  Definición de las tablas
```

## Las 5 ideas que debes tener claras

1. **No hay servidor de chat.** Solo hay un *buzón* en Vercel que guarda ofertas,
   respuestas y mensajes de señalización. Todo lo demás va P2P por WebRTC.

2. **El "código fijo" es la identidad.** Cada equipo deriva un código de 6
   caracteres a partir de una clave privada en `~/.chat_p2p/identity.key`.
   No cambia con la red, el puerto ni el nombre de usuario.

3. **Topología en estrella.** Los clientes no se hablan entre sí: todos pasan
   por el que "anfitrión" (`isHost`). El anfitrión reenvía mensajes.

4. **Todo lo que se cruza la red va en un `Packet` JSON.** Un solo tipo de
   mensaje con un campo `Type` que hace de discriminante.

5. **SQLite con un solo escritor.** Por eso el DSN incluye WAL y
   `busy_timeout` (ver [db.go](05-db.md)).

## Cómo ejecutar el proyecto

```bash
# Desarrollo (recarga en caliente + URL de navegador)
CC=/usr/bin/clang wails dev

# Build de producción
CC=/usr/bin/clang wails build     # -> build/bin/chat.app

# Solo el backend (verifica que compila)
CC=/usr/bin/clang go build .

# Tests (no necesitan red ni servidor)
CC=/usr/bin/clang go test ./...
```

> `CC=/usr/bin/clang` es necesario en macOS con Apple Silicon: el `clang` de
> Xcode apunta a un compilador que no encuentra los headers de WebKit.

## Los tests

Hay un único archivo de tests, `avatar_test.go`, con dos casos:

| Test | Qué protege |
|------|-------------|
| `TestWebPAnimadoSinResiduos` | que el WebP animado se codifique con `dispose=background` (si no, aparecen fantasmas en los GIF con transparencia) |
| `TestGifDisposalPrevious` | que se respete el método de disposal `previous` del GIF |

**No dependen de la red ni de herramientas externas**: parsean el byte de flags
del chunk `ANMF` del propio WebP generado.

```bash
CC=/usr/bin/clang go test -v -run TestWebP ./...
```

