# `main.go` — Arranque de la app

49 líneas. Solo hace una cosa: levantar la ventana de escritorio y engancharle
el backend Go.

## El código completo, comentado

```go
//go:embed all:frontend/dist
var assets embed.FS
```

**Qué hace**: incrusta el frontend ya compilado dentro del binario. `all:`
incluye archivos que empiezan por `_` o `.` (habitual en `dist`).

**Por qué**: el `.app` final tiene que ser un único ejecutable portable. Sin
esto habría que distribuir la carpeta `frontend/dist` aparte.

```go
func main() {
    app := NewApp()
```

**Por qué una sola instancia de `App`**: todo el estado (peers, código, BD,
nombre) vive en ese struct. Wails lo mantiene vivo durante toda la sesión y
lo expone a la UI.

```go
    err := wails.Run(&options.App{
        Title:  "chat",
        Width:  1024,
        Height: 768,
        AssetServer: &assetserver.Options{
            Assets: assets,
        },
        BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
        OnStartup:        app.startup,
        Bind: []interface{}{
            app,
        },
        Mac: &mac.Options{
            Preferences: &mac.Preferences{
                EnableAutoplayWithoutUserAction: u.True,
            },
        },
    })
```

### Desglose de las opciones

| Opción | Para qué |
|--------|----------|
| `Title` | título de la ventana ( luego lo cambia `SetChannelInfo`) |
| `Width`/`Height` | tamaño inicial (1024×768) |
| `AssetServer` | sirve el frontend embebido; también gestiona el esquema `wails://` |
| `BackgroundColour` | color de fondo **antes** de que cargue el HTML (evita el destello blanco) |
| `OnStartup` | callback: aquí se inicializa la BD y se restaura la sesión |
| `Bind` | **expone los métodos públicos de `App` al JavaScript**. Todo método público de `App` es automáticamente callable desde React |
| `EnableAutoplayWithoutUserAction` | permite que el audio del chat suene sin que el usuario haga clic (política de autoplay de WebKit) |

### El detalle de `Bind`

```go
Bind: []interface{}{ app },
```

Wails genera un binding en `frontend/wailsjs/go/main/App.js` con **todos los
métodos públicos** de `App`. Por eso:

```js
import { ConnectToPeer } from '../../wailsjs/go/main/App';
const res = await ConnectToPeer('ABC123');
```

**Por qué importa**: si añades un método público a `App.go` y no regeneras los
bindings, el frontend dará `X is not exported by wailsjs`. El README lo avisa:
tras tocar métodos públicos hay que correr `wails dev` unos segundos para
regenerar `frontend/wailsjs/`.

**Consecuencia práctica**: el prefijo `App` en los nombres de los métodos
públicos es parte de la API visible para el frontend. Renombrarlos rompe la UI.

## El flujo de arranque real

```
main()
  └─ wails.Run()
       ├─ crea la ventana
       ├─ llama app.startup(ctx)        ← OnStartup
       │    ├─ initDB()
       │    ├─ restaura el username guardado
       │    └─ restaura el título de la ventana
       └─ el frontend se carga y puede llamar a los métodos de App
```

`app.startup` recibe el `context.Context` de Wails y lo guarda en `a.ctx`.
**Es imprescindible**: `runtime.EventsEmit(a.ctx, ...)` es lo que permite
enviar eventos a la UI. Si `a.ctx` fuera `nil`, Wails hace `log.Fatalf` y
mata la app.

## Errores frecuentes

| Síntoma | Causa |
|---------|-------|
| `cannot call 'runtime.EventsEmit': An invalid context was passed` | `a.ctx` es nil o no es el contexto de Wails (pasa al correr tests fuera de Wails) |
| `X is not exported by wailsjs` | falta regenerar bindings tras añadir un método público |
| `Error: SetUsername is not exported...` | el `frontend/dist` embebido está viejo: recompila el frontend |

## Detalles de la compilación en macOS

```bash
CC=/usr/bin/clang wails build
```

El `clang` de Xcode en Apple Silicon apunta a un compilador que no encuentra
los headers de WebKit (los usa WebKitGTK en Linux y WebKit nativo en macOS).
Forzar `CC` lo resuelve.
