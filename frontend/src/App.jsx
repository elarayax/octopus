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

  useEffect(() => {
    SetUsername(username);

    const unsubMsg = EventsOn('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    const unsubConn = EventsOn('peer_connected', (addr) => {
      console.log('Peer conectado:', addr);
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
    const res = await StartServer(myPort);
    alert(res);

    // Obtener y guardar el ID Fijo y la Multiaddr
    const info = await GetNodeInfo();
    setNodeInfo(info);
  };

  const handleConnect = async () => {
    if (!peerAddress.trim()) return;
    const res = await ConnectToPeer(peerAddress);
    alert(res);
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    await SendMessage(inputText);
    setInputText('');
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('¡Copiado al portapapeles!');
  };

  return (
    <div style={{ padding: '20px', color: '#fff', textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Chat P2P - Identidad Fija</h2>

      {/* Nombre de Usuario */}
      <div style={{ marginBottom: '15px' }}>
        <input
          value={username}
          onChange={(e) => setUsernameInput(e.target.value)}
          placeholder="Tu nombre de usuario"
        />
        <button onClick={handleSaveUsername}>Guardar Nombre</button>
      </div>

      {/* Servidor Local */}
      <div style={{ marginBottom: '15px' }}>
        <input
          value={myPort}
          onChange={(e) => setMyPort(e.target.value)}
          placeholder="Puerto (ej: 8080)"
        />
        <button onClick={handleStartServer}>Iniciar Servidor</button>
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
          <div><strong>Tu ID Fijo:</strong> <span style={{ fontSize: '1.2em', color: '#4caf50' }}>{nodeInfo.code}</span></div>
          <div style={{ fontSize: '0.8em', color: '#aaa', marginTop: '5px', wordBreak: 'break-all' }}>
            <strong>Multiaddr:</strong> {nodeInfo.multiAddr}
          </div>
          <button
            onClick={() => copyToClipboard(nodeInfo.multiAddr)}
            style={{ marginTop: '8px', fontSize: '0.8em', padding: '4px 8px' }}
          >
            📋 Copiar Multiaddr para invitar
          </button>
        </div>
      )}

      {/* Conexión a Peer */}
      <div style={{ marginBottom: '20px' }}>
        <input
          value={peerAddress}
          onChange={(e) => setPeerAddress(e.target.value)}
          placeholder="Pega la Multiaddr de tu amigo..."
          style={{ width: '70%', marginRight: '5px' }}
        />
        <button onClick={handleConnect}>Conectar</button>
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
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '6px' }}>
            <strong style={{ color: '#646cff' }}>{m.sender}:</strong> {m.text}
          </div>
        ))}
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
