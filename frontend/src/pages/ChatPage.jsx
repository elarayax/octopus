import { useCallback } from 'react';
import { useToast, useMods, useProfile, useP2P, useChat, useVoiceCall } from '../hooks';
import { Toast } from '../components/atoms';
import {
  AppHeader,
  StatusBar,
  VoicePanel,
  ProfilePanel,
  ServerPanel,
  NodeInfoCard,
  ConnectionPanel,
  ChatHistory,
  ChatInput,
} from '../components/organisms';
import { MainLayout } from '../components/templates';

export default function ChatPage() {
  const { toast, notify } = useToast();
  const mods = useMods();
  const profile = useProfile({ notify });
  const p2p = useP2P({ notify });
  const chat = useChat({ notify });
  const call = useVoiceCall({ notify });

  const copyId = useCallback(
    async (code) => {
      try {
        await navigator.clipboard.writeText(code);
        notify(`¡ID Fijo "${code}" copiado al portapapeles!`, 'success');
      } catch {
        notify('No se pudo copiar el ID al portapapeles', 'error');
      }
    },
    [notify]
  );

  return (
    <>
      <MainLayout
        layout={mods.layout}
        header={<AppHeader onRefreshMods={mods.reload} onOpenMods={mods.openFolder} />}
        status={<StatusBar status={p2p.status} peers={p2p.peers.length} />}
        panels={{
          voice: <VoicePanel call={call} />,
          profile: (
            <ProfilePanel username={profile.username} onChange={profile.setUsername} onSave={profile.save} />
          ),
          server: <ServerPanel port={p2p.port} onChange={p2p.setPort} onStart={p2p.startServer} />,
          nodeInfo: p2p.nodeInfo.code && <NodeInfoCard code={p2p.nodeInfo.code} onCopy={copyId} />,
          connection: <ConnectionPanel onConnect={p2p.connect} />,
        }}
        chat={
          <>
            <ChatHistory messages={chat.messages} />
            <ChatInput onSend={chat.send} />
          </>
        }
      />
      <Toast toast={toast} />
    </>
  );
}
