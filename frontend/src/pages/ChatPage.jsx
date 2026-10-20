import { useState, useCallback } from 'react';
import { useToast, useMods, useProfile, useP2P, useChat, useVoiceCall, useUsers, useChannel, useChannels } from '../hooks';
import { SetChannelIconFromDialog } from '../../wailsjs/go/main/App';
import { Toast } from '../components/atoms';
import {
  AppHeader,
  StatusBar,
  VoicePanel,
  UsersPanel,
  ChannelsPanel,
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
  const { channel, save: saveChannel } = useChannel();
  const channels = useChannels({
    onSwitch: () => {
      chat.reload();
      users.refresh();
    },
    notify,
    p2pStatus: p2p.status,
  });

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
            channel={channel}
            onRefreshMods={mods.reload}
            onOpenMods={mods.openFolder}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        }
        status={
          <StatusBar
            status={p2p.status}
            peers={users.users.filter((u) => u.online && !u.self).length}
            server={{
              port: p2p.port,
              onPortChange: p2p.setPort,
              onStart: p2p.startServer,
              channel,
              onSaveChannel: saveChannel,
              onSetChannelIcon: SetChannelIconFromDialog,
            }}
          />
        }
        panels={{
          channels: (
            <ChannelsPanel
              channels={channels.channels}
              currentCode={p2p.nodeInfo?.code}
              onSwitch={channels.switchTo}
              onConnect={channels.connectTo}
              status={p2p.status}
            />
          ),
          voice: <VoicePanel call={call} />,
          users: <UsersPanel users={users.users} />,
          connection: <ConnectionPanel connect={p2p.connect} nodeInfo={p2p.nodeInfo} />,
          nodeInfo: <NodeInfoCard nodeInfo={p2p.nodeInfo} />,
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
