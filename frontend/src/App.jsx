import { useState, useEffect, useRef } from 'react';
import './App.css';
import {
  StartServer, ConnectToPeer, SendMessage, SetUsername,
  GetNodeInfo, SendAudio, GetChatHistory, LoadCustomCSS,
  LoadCustomLayout, OpenModsFolder, GetUsername
} from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";

function App() {
  const [username, setUsernameInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [myPort, setMyPort] = useState('8080');
  const [peerAddress, setPeerAddress] = useState('');
  const [nodeInfo, setNodeInfo] = useState({ code: '', multiAddr: '' });
  const [status, setStatus] = useState('⚪ Servidor no iniciado');
  const [connectedPeers, setConnectedPeers] = useState([]);

  // Estados de Llamada de Voz Continua
  const [inVoiceCall, setInVoiceCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const playbackCtxRef = useRef(null);
  const isMutedRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const remoteSpeakingTimerRef = useRef(null);

  const [layout, setLayout] = useState({
    themeName: 'Default',
    sidebarPosition: 'left',
    panels: { voice: true, connection: true, nodeInfo: true }
  });

  const reloadCSS = async () => {
    const cssText = await LoadCustomCSS();
    if (cssText !== undefined) {
      let styleTag = document.getElementById('mod-theme-style');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'mod-theme-style';
        document.head.appendChild(styleTag);
      }
      styleTag.innerHTML = cssText;
    }
  };

  // Función para recargar solo el Layout
  const reloadLayout = async () => {
    const modLayout = await LoadCustomLayout();
    if (modLayout && modLayout.panels) {
      setLayout(modLayout);
    }
  };

  // Handler para el botón de "Actualizar Mod"
  const handleRefreshMods = async () => {
    await reloadCSS();
    await reloadLayout();
    console.log("¡Mod actualizado con éxito!");
  };

  useEffect(() => {
    // Cargar el nombre de usuario guardado en SQLite (o el valor por defecto)
    GetUsername().then((name) => {
      if (name) {
        setUsernameInput(name);
      }
    }).catch(err => console.error("Error cargando nombre de usuario:", err));

    // 1. Cargar CSS del Mod
    LoadCustomCSS().then((cssText) => {
      if (cssText) {
        let styleTag = document.getElementById('mod-theme-style');
        if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = 'mod-theme-style';
          document.head.appendChild(styleTag);
        }
        styleTag.innerHTML = cssText;
      }
    });

    reloadCSS();
    reloadLayout();

    // 2. Cargar Layout JSON
    LoadCustomLayout().then((modLayout) => {
      if (modLayout && modLayout.panels) {
        setLayout(modLayout);
      }
    });

    GetChatHistory().then((history) => {
      if (history && history.length > 0) {
        setMessages(history);
      }
    }).catch(err => console.error("Error cargando historial de SQLite:", err));

    // Mensajes de texto
    const unsubMsg = EventsOn('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    // Conexiones P2P
    const unsubConn = EventsOn('peer_connected', (msg) => {
      console.log('Peer conectado:', msg);
      setConnectedPeers((prev) => {
        if (!prev.includes(msg)) return [...prev, msg];
        return prev;
      });
      setStatus('🟢 En línea - P2P WebRTC');
    });

    const unsubDisconn = EventsOn('peer_disconnected', (peerId) => {
      console.log('Peer desconectado:', peerId);
      setConnectedPeers((prev) => prev.filter((p) => !p.includes(peerId)));
    });

    // Audio en tiempo real
    const playbackCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000, latencyHint: 'interactive' });
    playbackCtxRef.current = playbackCtx;
    nextPlayTimeRef.current = playbackCtx.currentTime;

    const unsubAudio = EventsOn('receive_audio', (b64Audio) => {
      try {
        setRemoteSpeaking(true);
        if (remoteSpeakingTimerRef.current) clearTimeout(remoteSpeakingTimerRef.current);
        remoteSpeakingTimerRef.current = setTimeout(() => setRemoteSpeaking(false), 500);

        const binaryStr = atob(b64Audio);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768.0;
        }

        const audioBuffer = playbackCtx.createBuffer(1, float32.length, 16000);
        audioBuffer.copyToChannel(float32, 0);

        const bufferSource = playbackCtx.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.connect(playbackCtx.destination);

        const now = playbackCtx.currentTime;
        // Techo de latencia: si la cola supera ~150ms (ráfagas, micro-cortes),
        // descartamos el atraso y retomamos casi en vivo en vez de acumular delay.
        const MAX_LATENCY = 0.15;
        if (nextPlayTimeRef.current < now || nextPlayTimeRef.current - now > MAX_LATENCY) {
          nextPlayTimeRef.current = now + 0.03;
        }
        bufferSource.start(nextPlayTimeRef.current);
        nextPlayTimeRef.current += audioBuffer.duration;
      } catch (err) {
        console.error('Error procesando audio recibido:', err);
      }
    });

    getAudioDevices();
    const handleDeviceChangeEvt = () => {
      getAudioDevices();
    };
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChangeEvt);
    }

    return () => {
      unsubMsg();
      unsubConn();
      unsubDisconn();
      unsubAudio();
      if (playbackCtxRef.current) playbackCtxRef.current.close();
      if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChangeEvt);
      }
    };
  }, []);

  const getAudioDevices = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      setAudioDevices(inputs);
      if (inputs.length > 0) {
        setSelectedDeviceId((prev) => {
          const exists = inputs.some((d) => d.deviceId === prev);
          return exists && prev ? prev : inputs[0].deviceId;
        });
      }
    } catch (err) {
      console.error('Error listando dispositivos de audio:', err);
    }
  };

  const handleOpenModsFolder = async () => {
    const res = await OpenModsFolder();
    console.log(res);
  };

  const setupAudioCapture = async (deviceIdToUse) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceIdToUse) {
      audioConstraints.deviceId = { ideal: deviceIdToUse };
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
    });
    streamRef.current = stream;

    // Actualizar lista para poblar nombres de micrófonos tras obtener permiso
    getAudioDevices();

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000, latencyHint: 'interactive' });
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    // Buffer de 512 muestras @16kHz = 32ms por chunk (antes 2048 = 128ms de delay fijo)
    const processor = audioCtx.createScriptProcessor(512, 1, 1);

    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (e) => {
      if (isMutedRef.current) return;

      const input = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        let s = Math.max(-1, Math.min(1, input[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      let binary = '';
      const bytes = new Uint8Array(int16.buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);
      SendAudio(b64);
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioCtx.destination);
  };

  const handleDeviceChange = async (newDeviceId) => {
    setSelectedDeviceId(newDeviceId);
    if (inVoiceCall) {
      try {
        await setupAudioCapture(newDeviceId);
      } catch (err) {
        alert('Error cambiando de micrófono: ' + err.message);
      }
    }
  };

  const startVoiceCall = async () => {
    try {
      await setupAudioCapture(selectedDeviceId);
      // Reiniciar el cursor de reproducción para no heredar atraso de una llamada anterior
      if (playbackCtxRef.current) {
        nextPlayTimeRef.current = playbackCtxRef.current.currentTime;
      }
      setInVoiceCall(true);
      setIsMuted(false);
      isMutedRef.current = false;
    } catch (err) {
      alert('Error activando micrófono: ' + err.message);
    }
  };

  const stopVoiceCall = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setInVoiceCall(false);
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      return next;
    });
  };

  const handleSaveUsername = async () => {
    const name = await SetUsername(username);
    alert(`Nombre guardado: ${name}`);
  };

  const handleStartServer = async () => {
    setStatus('🟡 Servidor activo, esperando conexiones...');
    const res = await StartServer(myPort);
    alert(res);

    const info = await GetNodeInfo();
    setNodeInfo(info);
  };

  const handleConnect = async () => {
    if (!peerAddress.trim()) return;
    setStatus('🟡 Conectando con peer...');
    const res = await ConnectToPeer(peerAddress);
    alert(res);
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const res = await SendMessage(inputText);
    if (res !== 'Enviado') {
      alert(res);
    }
    setInputText('');
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert(`¡ID Fijo "${text}" copiado al portapapeles!`);
  };

  return (
    <div style={{ padding: '20px', color: '#fff', textAlign: 'left', maxWidth: '650px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2>Chat P2P - Texto & Voz en Vivo</h2>
        <button
          onClick={handleRefreshMods}
          style={{ backgroundColor: '#2e7d32', color: '#fff' }}
          title="Recargar CSS y Layout sin reiniciar"
        >
          🔄 Actualizar Mod
            </button>
        <button
          onClick={handleOpenModsFolder}
          style={{ backgroundColor: '#4a4d6e', color: '#fff' }}
        >
          📁 Abrir carpeta de Mods
        </button>
      </div>

      {/* Barra de Estado */}
      <div style={{
        padding: '8px 12px',
        backgroundColor: '#1f2430',
        borderRadius: '6px',
        marginBottom: '15px',
        fontSize: '0.9em',
        border: '1px solid #3d4455',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <div><strong>Estado:</strong> <span>{status}</span></div>
        <div><strong>Peers activos:</strong> <span style={{ color: '#4caf50' }}>{connectedPeers.length}</span></div>
      </div>

      {/* RENDERIZADO CONDICIONAL: Panel de Voz */}
      {layout.panels.voice && (
        <div className="voice-panel" style={{
          padding: '12px 16px',
          backgroundColor: inVoiceCall ? '#1e3a2f' : '#232733',
          borderRadius: '8px',
          marginBottom: '15px',
          border: inVoiceCall ? '1px solid #4caf50' : '1px solid #3d4455',
        }}>
          <div className="voice-header" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div className="voice-info">
              <strong style={{ fontSize: '1.05em' }}>📞 Canal de Voz en Vivo:</strong>
              <div style={{ fontSize: '0.85em', color: inVoiceCall ? '#81c784' : '#aaa', marginTop: '3px' }}>
                {inVoiceCall ? (
                  <span>🟢 En llamada continua {isMuted ? '(🔇 Micrófono Silenciado)' : '(🎙️ Micrófono Abierto)'}</span>
                ) : (
                  <span>⚪ Fuera de llamada</span>
                )}
                {remoteSpeaking && <span style={{ marginLeft: '10px', color: '#64b5f6' }}>🔊 Alguien está hablando...</span>}
              </div>
            </div>

            <div className="voice-actions" style={{ display: 'flex', gap: '8px' }}>
              {!inVoiceCall ? (
                <button
                  className="voice-btn-join"
                  onClick={startVoiceCall}
                  style={{ backgroundColor: '#2e7d32', color: '#fff', padding: '6px 14px', fontWeight: 'bold' }}
                >
                  🎙️ Unirse a Voz
                </button>
              ) : (
                <>
                  <button
                    className="voice-btn-mute"
                    onClick={toggleMute}
                    style={{
                      backgroundColor: isMuted ? '#d32f2f' : '#388e3c',
                      color: '#fff',
                      padding: '6px 12px'
                    }}
                  >
                    {isMuted ? '🔇 Desmutear' : '🎙️ Mutear'}
                  </button>
                  <button
                    className="voice-btn-leave"
                    onClick={stopVoiceCall}
                    style={{ backgroundColor: '#c62828', color: '#fff', padding: '6px 12px' }}
                  >
                    🔴 Salir
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Selector de Micrófono */}
          <div className="voice-device-selector" style={{
            marginTop: '12px',
            paddingTop: '8px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85em'
          }}>
            <label htmlFor="mic-select" style={{ color: '#bbb', whiteSpace: 'nowrap' }}>
              🎙️ Micrófono:
            </label>
            <select
              id="mic-select"
              className="voice-select"
              value={selectedDeviceId}
              onChange={(e) => handleDeviceChange(e.target.value)}
              style={{
                backgroundColor: '#161922',
                color: '#fff',
                border: '1px solid #4a4d6e',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '0.9em',
                flex: 1,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {audioDevices.length === 0 ? (
                <option value="">Por defecto del sistema</option>
              ) : (
                audioDevices.map((dev, idx) => (
                  <option key={dev.deviceId || idx} value={dev.deviceId}>
                    {dev.label || (idx === 0 ? 'Micrófono predeterminado' : `Micrófono ${idx + 1}`)}
                  </option>
                ))
              )}
            </select>
            <button
              className="voice-btn-refresh"
              onClick={getAudioDevices}
              title="Recargar lista de micrófonos"
              style={{
                backgroundColor: '#383d52',
                color: '#ccc',
                padding: '4px 8px',
                fontSize: '0.85em',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🔄
            </button>
          </div>
        </div>
      )}

      {/* Nombre de Usuario */}
      <div style={{ marginBottom: '15px' }}>
        <input
          value={username}
          onChange={(e) => setUsernameInput(e.target.value)}
          placeholder="Tu nombre de usuario"
        />
        <button onClick={handleSaveUsername}>Guardar Nombre</button>
      </div>

      {/* Servidor Local con Puerto */}
      <div style={{ marginBottom: '15px' }}>
        <input
          value={myPort}
          onChange={(e) => setMyPort(e.target.value)}
          placeholder="Puerto (ej: 8080)"
        />
        <button onClick={handleStartServer} style={{ backgroundColor: '#2e7d32', color: '#fff' }}>
          Iniciar Servidor
        </button>
      </div>

      {/* RENDERIZADO CONDICIONAL: ID Fijo de Máquina */}
      {layout.panels.nodeInfo && nodeInfo.code && (
        <div style={{
          backgroundColor: '#2a2d3e',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '15px',
          border: '1px solid #4a4d6e'
        }}>
          <div><strong>Tu ID Fijo:</strong> <span style={{ fontSize: '1.4em', color: '#4caf50', fontWeight: 'bold' }}>{nodeInfo.code}</span></div>
          <div style={{ fontSize: '0.8em', color: '#aaa', marginTop: '5px' }}>
            Este ID es permanente para este puerto. Tus amigos pueden usarlo para conectarse contigo siempre.
          </div>
          <button
            onClick={() => copyToClipboard(nodeInfo.code)}
            style={{ marginTop: '8px', fontSize: '0.85em', padding: '6px 12px', cursor: 'pointer' }}
          >
            📋 Copiar ID Fijo para invitar
          </button>
        </div>
      )}

      {/* RENDERIZADO CONDICIONAL: Panel de Conexión */}
      {layout.panels.connection && (
        <div style={{ marginBottom: '20px' }}>
          <input
            value={peerAddress}
            onChange={(e) => setPeerAddress(e.target.value)}
            placeholder="Pega el ID Fijo de tu amigo (6 letras)..."
            style={{ width: '65%', marginRight: '5px' }}
          />
          <button onClick={handleConnect} style={{ backgroundColor: '#1976d2', color: '#fff' }}>
            Conectar
          </button>
        </div>
      )}

      {/* Historial de Mensajes de Texto */}
      <div style={{
        border: '1px solid #444',
        height: '200px',
        overflowY: 'auto',
        padding: '10px',
        backgroundColor: '#1a1a1a',
        borderRadius: '8px'
      }}>
        {messages.length === 0 ? (
          <div style={{ color: '#666', fontStyle: 'italic', marginTop: '70px', textAlign: 'center' }}>
            No hay mensajes aún. ¡Inicia el servidor y conéctate con tus amigos!
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} style={{ marginBottom: '6px' }}>
              <strong style={{ color: '#646cff' }}>{m.sender}:</strong> {m.text}
            </div>
          ))
        )}
      </div>

      {/* Envío de Mensajes de Texto */}
      <div style={{ marginTop: '10px' }}>
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Escribe un mensaje..."
          style={{ width: '75%', marginRight: '5px' }}
        />
        <button onClick={handleSend}>Enviar</button>
      </div>
    </div>
  );
}

export default App;
