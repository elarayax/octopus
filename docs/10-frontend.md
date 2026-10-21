# Frontend — el puente Go ↔ React

Aunque el foco de esta documentación es Go, el frontend es la mitad del
problema (fue donde estaban dos de los bugs másxyl). Aquí se explica cómo
se comunican ambas partes.

## El puente

Wails genera un binding automático por cada **método público** de `App`:

```js
// frontend/wailsjs/go/main/App.js  (generado, no editar a mano)
export function ConnectToPeer(arg1) {
  return window['go']['main']['App']['ConnectToPeer'](arg1);
}
```

Y una función para escuchar los eventos emitidos por Go:

```js
// frontend/wailsjs/runtime/runtime.js
import { EventsOn } from '../../wailsjs/runtime/runtime';

const off = EventsOn('receive_message', (msg) => { ... });
```

**Regla de oro**: los archivos de `frontend/wailsjs/` se **regeneran** con
`wails dev`. Si añades un método público a Go y no recompilas los bindings,
el frontend falla con `X is not exported by wailsjs`.

## Los dos sentidos de la comunicación

```
React  ──llamada──►  Go                (Wails binding:返回 un valor)
React  ◄──evento───  Go                (runtime.EventsEmit)
```

### Go → React: los eventos

| Evento | Cuándo | Payload |
|--------|--------|---------|
| `peer_connected` | se abre un DataChannel | `string` (descripción) |
| `peer_disconnected` | se pierde un peer | `string` (código) |
| `peer_info` | llega un `hello`/`avatar`/`roster`/`bye` | `UserEntry` |
| `receive_message` | mensaje de texto o imagen | `Message` |
| `receive_audio` | chunk de voz | `string` (base64) |
| `history_synced` | se fusionó un historial | `int` (nº de mensajes) |
| `channel_info` | cambió la identidad del canal | `ChannelInfo` |
| `channel_switched` | se cambió de canal | `string` (código) |

**Por qué eventos y no polling desde la UI**: el backend notifica en el
momento; la UI no tiene que preguntar cada cuánto.

### React → Go: los bindings

| Método | Para qué |
|--------|----------|
| `StartServer(port)` | arranca el buzón y fija el código |
| `ConnectToPeer(code)` | conecta con un peer |
| `SendMessage(text)` | envía un mensaje |
| `SendImageFromDialog()` | envía una imagen |
| `GetChatHistory()` | historial del canal activo |
| `GetUsers()` | lista de usuarios |
| `GetCanales()` / `SwitchToCanal()` | canales |
| `SetUsername(name)` | cambia el nombre |
| `GetAvatar()` / `SetAvatarFromDialog()` | avatar |
| `SetAudioPrefs(mic, playback)` | volúmenes |
| `LoadCustomCSS()` / `LoadCustomLayout()` | mods |
| `OpenModsFolder()` | abre la carpeta de mods |

## Los hooks

Cada hook encapsula una preocupación y se apoya en `EventsOn` para
mantenerse sincronizado.

### `useChat({ notify })`

```js
const offMsg = EventsOn('receive_message', (msg) => {
  setMessages((prev) => [...prev, msg]);
});
```

**Por qué `setMessages(prev => [...prev, msg])` y no `setMessages([...messages, msg])`**: la forma funcional siempre usa el valor más reciente del estado. Con la forma directa se perderían mensajes si dos llegaran en el mismo tick.

**Por qué recarga el historial en `history_synced`**: la fusión de historiales
inserta mensajes en la BD. La UI no puede construirlos ella misma (faltaría
la información del canal), así que vuelve a pedir el historial.

**Por qué también en `channel_switched`**: al cambiar de canal, el array de
mensajes es otro.

### `useUsers()`

```js
const offs = [
  EventsOn('peer_connected', refresh),
  EventsOn('peer_disconnected', refresh),
  EventsOn('peer_info', refresh),
];
```

**Por qué `refresh` y no un update optimista**: la lista de usuarios depende
de quién está conectado **y** del directorio persistente. Es más simple y
fiable pedir el estado real al backend.

**Por qué `avatarByName`**: un mapa nombre → avatar para pintar las fotos en
los mensajes sin tener que buscar en el array en cada render.

### `useP2P({ notify })` — el estado de la conexión

```js
export const STATUS = {
  IDLE: 'idle',
  LISTENING: 'listening',
  CONNECTING: 'connecting',
  ONLINE: 'online',
};
```

| Estado | Significado |
|--------|-------------|
| `idle` | el servidor no está iniciado |
| `listening` | servidor activo, esperando peers |
| `connecting` | se envió una oferta, esperando respuesta |
| `online` | hay al menos un peer conectado |

**Por qué son minúsculas**: es la convención del resto del frontend. **Este
detalle causó un bug real**: `ChannelsPanel.jsx` comparaba con `'IDLE'`
(mayúsculas) y el botón de conectar **nunca aparecía**. Ver
[Bugs corregidos](11-bugs-corregidos.md).

**Las transiciones**:
```
IDLE       --startServer()-->  LISTENING
LISTENING  --connect()-->      CONNECTING
CONNECTING --peer_connected--> ONLINE
CONNECTING --error-->          LISTENING
```

### `useVoiceCall({ notify })`

Compone cuatro hooks:
- `useAudioPrefs()` — volúmenes (persistidos en Go).
- `useAudioDevices()` — lista de micrófonos.
- `useAudioPlayback()` — reproduce el audio recibido (`receive_audio`).
- `useMicCapture()` — captura del micrófono y envía a Go (`SendAudio`).

**Por qué el audio vive entero en el frontend**: el navegador tiene acceso a
la API de Web Audio (captura, niveles, reproducción). Go solo transporta los
chunks ya codificados.

**Por qué `playback.resume()`**: por la política de autoplay de los
navegadores, el `AudioContext` empieza suspendido hasta que el usuario
interactúa. `resume()` lo despierta. En macOS, `EnableAutoplayWithoutUserAction`
en `main.go` lo permite sin clic.

### `useChannels({ onSwitch, notify, p2pStatus })`

```js
const connectTo = async (codigo) => {
  await SwitchToCanal(codigo);
  const res = await ConnectToPeer(codigo);
  if (res && !res.includes('Error') && !res.includes('No puedes')) {
    notify(`Conectando a ${codigo}...`, 'success');
  } else if (res) {
    notify(res, 'error');
  }
};
```

**Por qué `SwitchToCanal` antes de `ConnectToPeer`**: al conectar con un
código nuevo se quiere ver ese canal, no el anterior.

**Por qué se comprueba el texto de la respuesta**: `ConnectToPeer` devuelve
un string que puede ser un mensaje de éxito **o** de error. La UI decide el
tipo del toast según el contenido.

### `useToast(duration = 3000)`

```js
const notify = (message, type = 'info') => {
  clearTimeout(timerRef.current);
  setToast({ message, type });
  timerRef.current = setTimeout(() => setToast(null), duration);
};
```

**Por qué `clearTimeout` antes de fijar el nuevo**: si llegan dos mensajes
seguidos, el primero no debe hiding el segundo a mitad.

**Por qué 3 segundos**: tiempo suficiente para leer un mensaje corto. Es un
compromiso; para errores largos conviene más (el toast de error de
`useP2P.connect` puede cortar el texto).

## Los dos bugs del frontend (resumen)

### 1. `ConnectionPanel` recibía una prop que no existía

```jsx
// ChatPage.jsx
<ConnectionPanel connect={p2p.connect} nodeInfo={p2p.nodeInfo} />

// ConnectionPanel.jsx  ← el bug
export function ConnectionPanel({ onConnect }) {   // "onConnect" no existe
  ...
  onSubmit={() => onConnect(address)}              // TypeError
}
```

**El síntoma**: al pulsar "Conectar", un `TypeError` en la consola del
navegador (no en la terminal de Go) y **nada más**. Go nunca se enteraba.

**El fix**: usar el nombre real de la prop (`connect`).

**La lección**: en React, un destructuring con un nombre equivocado produce
`undefined` en silencio. TypeScript lo habría detectado; JS no.

### 2. `ChannelsPanel` comparaba el estado con mayúsculas

```jsx
const idle = status === 'IDLE';   // los estados son 'idle', 'listening', ...
```

**El síntoma**: el botón ▶ de la lista de canales **nunca se renderizaba**.

**El fix**: importar `STATUS` de `useP2P` (como ya hacía `StatusBar.jsx`) y
comparar contra `STATUS.CONNECTING`.

**La lección**: los valores mágicos duplicados en varios archivos se
desincronizan. La solución es la fuente única de verdad (`STATUS`).

## Comprobación rápida

Si un método de Go no aparece en el frontend:

```bash
# 1. ¿está en el binding?
grep -n "ConnectToPeer" frontend/wailsjs/go/main/App.js

# 2. ¿el frontend está compilado?
cd frontend && npm run build
```

Si el binding existe pero la app no lo ve, es que el `frontend/dist`
embebido está viejo: recompila el frontend **y** el binario.
