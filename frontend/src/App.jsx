import { useState, useEffect } from 'react';
import './App.css';
import { StartServer, ConnectToPeer, SendMessage, SetUsername, GetNodeInfo } from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";

function App() {
  const [username, setUsernameInput] = useState('Byron');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [peerAddress, setPeerAddress] = useState('');
  const [nodeInfo, setNodeInfo] = useState({ code: '', multiAddr: '' });
  const [status, setStatus] = useState('⚪ Desconectado');

  useEffect(() => {
    SetUsername(username);

    const unsubMsg = EventsOn('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    const unsubConn = EventsOn('peer_connected', (msg) => {
      console.log('Peer conectado:', msg);
      setStatus('🟢 Conectado vía WebRTC P2P');
    });

    return () => {
      unsubMsg();
      unsubConn();
    };
  }, []);

  const handleSaveUsername = async () => {
    const name = await SetUsername(username);
    alert(`Nombre guardado: ${name}`);
  };

  const handleStartServer = async () => {
    setStatus('🟡 Creando sala y esperando al peer...');
    const res = await StartServer('0');
    alert(res);

    const info = await GetNodeInfo();
    setNodeInfo(info);
  };

  const handleConnect = async () => {
    if (!peerAddress.trim()) return;
    setStatus('🟡 Conectando con el peer...');
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
    alert(`¡Código "${text}" copiado al portapapeles!`);
  };

  return (
    <div style={{ padding: '20px', color: '#fff', textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Chat P2P - WebRTC Nativo</h2>

      {/* Estado de Conexión */}
      <div style={{
        padding: '8px 12px',
        backgroundColor: '#1f2430',
        borderRadius: '6px',
        marginBottom: '15px',
        fontSize: '0.9em',
        border: '1px solid #3d4455'
      }}>
        <strong>Estado:</strong> <span>{status}</span>
      </div>

      {/* Nombre de Usuario */}
      <div style={{ marginBottom: '15px' }}>
        <input
          value={username}
          onChange={(e) => setUsernameInput(e.target.value)}
          placeholder="Tu nombre de usuario"
        />
        <button onClick={handleSaveUsername}>Guardar Nombre</button>
      </div>

      {/* Crear Sala */}
      <div style={{ marginBottom: '15px' }}>
        <button
          onClick={handleStartServer}
          style={{ backgroundColor: '#2e7d32', color: '#fff', fontWeight: 'bold' }}
        >
          🚀 Crear Sala WebRTC
        </button>
      </div>

      {/* Panel con Código de Sala */}
      {nodeInfo.code && (
        <div style={{
          backgroundColor: '#2a2d3e',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '15px',
          border: '1px solid #4a4d6e'
        }}>
          <div><strong>Código de tu Sala:</strong> <span style={{ fontSize: '1.4em', color: '#4caf50', fontWeight: 'bold' }}>{nodeInfo.code}</span></div>
          <div style={{ fontSize: '0.8em', color: '#aaa', marginTop: '5px' }}>
            Comparte este código de 6 letras con tu amigo para que se conecte por Internet sin importar en qué red esté.
          </div>
          <button
            onClick={() => copyToClipboard(nodeInfo.code)}
            style={{ marginTop: '8px', fontSize: '0.85em', padding: '6px 12px', cursor: 'pointer' }}
          >
            📋 Copiar Código para invitar
          </button>
        </div>
      )}

      {/* Conectar a Sala */}
      <div style={{ marginBottom: '20px' }}>
        <input
          value={peerAddress}
          onChange={(e) => setPeerAddress(e.target.value)}
          placeholder="Pega el código de 6 letras de tu amigo..."
          style={{ width: '65%', marginRight: '5px' }}
        />
        <button onClick={handleConnect} style={{ backgroundColor: '#1976d2', color: '#fff' }}>
          Unirse a Sala
        </button>
      </div>

      {/* Historial de Mensajes */}
      <div style={{
        border: '1px solid #444',
        height: '220px',
        overflowY: 'auto',
        padding: '10px',
        backgroundColor: '#1a1a1a',
        borderRadius: '8px'
      }}>
        {messages.length === 0 ? (
          <div style={{ color: '#666', fontStyle: 'italic', marginTop: '80px', textAlign: 'center' }}>
            No hay mensajes aún. ¡Conéctate con un peer para chatear!
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} style={{ marginBottom: '6px' }}>
              <strong style={{ color: '#646cff' }}>{m.sender}:</strong> {m.text}
            </div>
          ))
        )}
      </div>

      {/* Envío de Mensajes */}
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
