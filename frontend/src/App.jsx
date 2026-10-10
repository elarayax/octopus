import { useState, useEffect } from 'react';
import './App.css';
import { StartServer, ConnectToPeer, SendMessage, SetUsername, GetNodeInfo } from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";

function App() {
  const [username, setUsernameInput] = useState('Byron');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [myPort, setMyPort] = useState('8080');
  const [peerAddress, setPeerAddress] = useState('');
  const [nodeInfo, setNodeInfo] = useState({ code: '', multiAddr: '' });
  const [status, setStatus] = useState('⚪ Servidor no iniciado');
  const [connectedPeers, setConnectedPeers] = useState([]);

  useEffect(() => {
    SetUsername(username);

    const unsubMsg = EventsOn('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

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

    return () => {
      unsubMsg();
      unsubConn();
      unsubDisconn();
    };
  }, []);

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
    <div style={{ padding: '20px', color: '#fff', textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Chat P2P - Identidad Fija & Grupal</h2>

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

      {/* Panel con Tu ID Fijo de Máquina */}
      {nodeInfo.code && (
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

      {/* Conexión a Peer */}
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
