import { useState, useCallback } from 'react';
import { useToast, useMods, useProfile, useP2P, useChat, useVoiceCall, useUsers } from '../hooks';
import { Toast } from '../components/atoms';
import {
  AppHeader,
  StatusBar,
  VoicePanel,
  UsersPanel,
  SettingsModal,
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
  const users = useUsers();

  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // Tras guardar nombre o foto, refrescar la lista de usuarios
  const handleSaveUsername = useCallback(async () => {
    await profile.save();
    users.refresh();
  }, [profile, users]);

  const handlePickAvatar = useCallback(async () => {
    await profile.pickAvatar();
    users.refresh();
  }, [profile, users]);

  return (
    <>
      <MainLayout
        layout={mods.layout}
        header={
          <AppHeader
            onRefreshMods={mods.reload}
            onOpenMods={mods.openFolder}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        }
        status={
          <StatusBar
            status={p2p.status}
            peers={users.users.filter((u) => u.online && !u.self).length}
            server={{ port: p2p.port, onPortChange: p2p.setPort, onStart: p2p.startServer }}
          />
        }
        panels={{
          voice: <VoicePanel call={call} />,
          users: <UsersPanel users={users.users} />,
          nodeInfo: p2p.nodeInfo.code && <NodeInfoCard code={p2p.nodeInfo.code} onCopy={copyId} />,
          connection: <ConnectionPanel onConnect={p2p.connect} />,
        }}
        chat={
          <>
            <ChatHistory messages={chat.messages} avatars={users.avatarByName} />
            <ChatInput onSend={chat.send} onSendImage={chat.sendImage} />
          </>
        }
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        username={profile.username}
        onUsernameChange={profile.setUsername}
        onSaveUsername={handleSaveUsername}
        avatar={profile.avatar}
        onPickAvatar={handlePickAvatar}
      />
      <Toast toast={toast} />
    </>
  );
}
