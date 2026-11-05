# Canales externos, estado de conexión y sonidos

Este documento describe el flujo actual de selección y conexión a canales, los
indicadores visuales de la lista y los sonidos de conexión y voz. Complementa
[10-frontend.md](10-frontend.md) y [11-bugs-corregidos.md](11-bugs-corregidos.md)
con el comportamiento vigente.

## Selección no significa conexión

La aplicación conserva dos estados distintos:

| Estado | Cómo cambia | Presentación |
|---|---|---|
| Canal seleccionado | Clic en el cuerpo de la tarjeta o comienzo de Play | Resaltado neutro; cambia el chat que se muestra |
| Conexión pendiente | Se inicia `ConnectToPeer` para ese código | Verde tenue y botón temporal … |
| Conectado | Se abre el DataChannel `"chat"` y Go emite `peer_connected` | Verde tenue y marca ✓ |
| Error o desconexión | Error de solicitud, `peer_disconnected` o timeout de intento | Se limpia el estado; Play queda disponible otra vez |
| Canal personal | Su código coincide con el ID fijo del equipo | Conserva el estilo violeta propio y no ofrece Play hacia sí mismo |

El clic en el cuerpo solo llama a `SwitchToCanal`: selecciona el historial sin
crear una conexión. El botón Play cambia primero al canal y luego llama a
`ConnectToPeer`. Su estado se calcula por código de canal, así que cambiar a otro
canal no hereda el estado pendiente del anterior.

## Quién mantiene cada estado

- `GetCurrentChannelCode()` en `app.go` proporciona el código seleccionado al
  iniciar la interfaz. `GetPersonalChannelCode()` proporciona el ID fijo del
  equipo incluso antes de iniciar el servidor.
- `useChannels.js` mantiene `selectedCode` y `connectingCodes`. Los eventos
  `channel_switched`, `peer_connected` y `peer_disconnected` actualizan esos valores.
- `useP2P.js` mantiene los códigos conectados a partir de los eventos del
  backend. `peer_connected` se emite cuando abre el canal `"chat"`; seleccionar una
  tarjeta o enviar una oferta no basta para marcarla conectada.
- `ChannelsPanel.jsx` compara el código de cada tarjeta con el ID personal, el
  canal seleccionado, los códigos conectados y los intentos pendientes.
- `organisms.css` conserva el estilo personal y usa un fondo/borde verde con
  opacidad para las filas en conexión o conectadas. La selección por sí sola no
  recibe el verde de conexión.

El botón Play permanece en las tarjetas externas válidas. Se deshabilita para
ese código mientras la conexión está pendiente o ya está abierta, para evitar
duplicar `PeerConnections`. Una selección distinta no lo deshabilita.

## Integración en la pantalla y en el canal de voz

`ChatPage.jsx` compone los hooks y conecta sus estados con los organismos:

- Pasa `channels.personalCode`, `selectedCode`, `p2p.peers` y
  `channels.connectingCodes` a `ChannelsPanel.jsx`. Así la tarjeta distingue
  identidad personal, selección, intento pendiente y conexión establecida.
- Crea `call` con `useVoiceCall()` y lo pasa a `VoicePanel.jsx`.
- En la selección mediante el cuerpo de la tarjeta, el callback `onSwitch` que
  pasa `ChatPage.jsx` recarga el chat y los usuarios. Al usar Play, el evento
  `channel_switched` hace que `useChat()` recargue el historial; los eventos de
  conexión actualizan la lista de usuarios.

`useChannel.js` sigue encargado de la identidad y metadatos del canal
(nombre, subtítulo e ícono). La selección de canales recientes y la conexión
P2P se administran en `useChannels.js`; no se sustituyó el hook de metadatos.

Para voz, los clics locales y los eventos remotos son dos caminos
complementarios:

1. `VoicePanel.jsx` reproduce inmediatamente `voice-join.mp3` o
   `voice-leave.mp3` desde el gesto del usuario y llama a `join()` o
   `leave()`. Cada reproducción captura errores de `Audio.play()`.
2. `useVoiceCall.js` inicia o detiene la captura del micrófono y llama a
   `SetVoicePresence(true/false)` para anunciar el cambio a los peers.
3. Go envía los paquetes `voice_join` y `voice_leave`. Al recibirlos,
   `handlePacket` actualiza la presencia de voz y emite
   `voice_peer_joined` o `voice_peer_left` por Wails. Si un peer se desconecta
   mientras estaba en voz, Go también emite su evento de salida.
4. `useVoiceNotifications.js`, montado desde `VoicePanel.jsx`, reproduce los
   mismos efectos para los peers remotos. Go ignora el eco del código propio,
   por lo que la acción local no se reproduce una segunda vez por el evento.

El sonido separado `channel-connect.mp3` se maneja en `useP2P.js` y solo
responde al evento `peer_connected` de chat. No comparte los eventos ni los
archivos de entrada/salida de voz.

## Flujo de Play y reintentos

```text
Play
  → SwitchToCanal(código)
  → ConnectToPeer(código)
  → señalización offer/answer
  → apertura de DataChannel "chat"
  → peer_connected(código)
```

Go usa `connectingPeers` para rechazar solicitudes duplicadas durante la
creación de la conexión. Si falla la creación de la oferta o el envío de la
señalización, libera el intento de inmediato. Cuando el canal se abre, Go emite
`peer_connected`; si la conexión termina, emite `peer_disconnected`. React limpia
el estado de espera con cualquiera de esos eventos.

Puede ocurrir que la oferta se envíe pero el otro equipo no responda. En ese
caso WebRTC puede quedarse en estado new sin producir un evento ICE de fallo.
Como respaldo, `webrtc.go` expira el intento después de **30 segundos** si el
DataChannel de chat sigue sin abrirse. El vencimiento elimina la sesión pendiente
y emite `peer_disconnected`, permitiendo volver a pulsar Play. La demora depende
de la señalización y de la respuesta del peer; no se espera ese límite cuando
Go detecta antes un fallo o una desconexión.

## Sonidos

Los sonidos están en `frontend/src/assets/sounds/`:

| Archivo | Acción | Implementación |
|---|---|---|
| `channel-connect.mp3` | Se abre correctamente una conexión externa de chat | `useP2P.js` escucha `peer_connected` |
| `voice-join.mp3` | El usuario local pulsa «Unirse a Voz»; también suena para un peer remoto que entra | Reproducción local en `VoicePanel.jsx`; eventos remotos en `useVoiceNotifications.js` |
| `voice-leave.mp3` | El usuario local pulsa «Salir»; también suena cuando sale un peer remoto | Reproducción local en `VoicePanel.jsx`; eventos remotos en `useVoiceNotifications.js` |

El tono de conexión de chat solo se activa al abrirse el DataChannel, no al
seleccionar una tarjeta ni al pulsar Play. Los sonidos locales de voz comienzan
directamente desde el clic; los avisos remotos llegan mediante los eventos de
Wails `voice_peer_joined` y `voice_peer_left`. Las llamadas a `Audio.play()`
manejan el rechazo de la promesa para tolerar las políticas de autoplay del
WebView.

## Archivos relacionados

- Backend: `app.go` (`GetCurrentChannelCode`, `GetPersonalChannelCode`,
  `SetVoicePresence`) y `webrtc.go` (señalización, eventos de peers y voz,
  conexiones duplicadas y expiración).
- Frontend: `pages/ChatPage.jsx`, `hooks/useChannels.js`,
  `hooks/useP2P.js`, `hooks/useVoiceCall.js`,
  `hooks/useVoiceNotifications.js`, `components/organisms/ChannelsPanel.jsx`
  y `components/organisms/VoicePanel.jsx`.
- Estilos: `frontend/src/styles/organisms.css`.
