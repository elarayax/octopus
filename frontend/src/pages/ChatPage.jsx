import { useState, useCallback, useMemo } from 'react';
import { useToast, useMods, useProfile, useP2P, useChat, useVoiceCall, useVideoCall, useScreenShare, useUnread, useUsers, useChannel, useChannels } from '../hooks';
import { STATUS } from '../hooks/useP2P';
import { SetChannelIconFromDialog } from '../../wailsjs/go/main/App';
import { Toast } from '../components/atoms';
import {
  AppHeader,
  SidebarBrand,
  SearchBox,
  VoicePanel,
  VideoStage,
  UsersPanel,
  ChannelsPanel,
  InvitePanel,
  SettingsModal,
  ServerModal,
  ChatHistory,
  ChatInput,
} from '../components/organisms';
import { MainLayout } from '../components/templates';
export default function ChatPage() {
  const { toast, notify } = useToast();
  const mods = useMods();
  const profile = useProfile({ notify });
  const p2p = useP2P({ notify });
  const unread = useUnread(); // contador + notificación cuando la ventana no tiene el foco
  const chat = useChat({ notify, onIncoming: unread.onIncoming });
  const call = useVoiceCall({ notify });
  const video = useVideoCall({ notify });
  const screen = useScreenShare({ notify });
  const users = useUsers();
  const { channel, save: saveChannel } = useChannel();
  const channels = useChannels({
    onSwitch: () => {
      chat.reload();
      users.refresh();
    },
    notify,
    p2pStatus: p2p.status,
    connectedCodes: p2p.peers,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const [query, setQuery] = useState('');

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

  const isStarted = p2p.status !== STATUS.IDLE;
  const peers = users.users.filter((u) => u.online && !u.self);
  const onlineUsers = users.users.filter((u) => u.online);
  const selfName = users.users.find((u) => u.self)?.name || profile.username;

  // Gente en la llamada de voz (tú + los demás que siguen conectados).
  // Los que no tienen cámara se pintan en el VideoStage con su avatar.
  const selfUser = users.users.find((u) => u.self);
  const participants = useMemo(() => {
    const list = [];
    if (call.active || video.on) list.push({ name: selfName, self: true, avatar: selfUser?.avatar });
    const online = new Set(peers.map((p) => p.name));
    call.members
      .filter((n) => online.has(n) && n !== selfName)
      .forEach((n) => list.push({ name: n, avatar: users.avatarByName[n] }));
    return list;
  }, [call.active, call.members, video.on, selfName, selfUser?.avatar, peers, users.avatarByName]);

  // Canal activo: por nombre (refleja el canal al que se cambió); ante empate, el del código propio
  const activeCode = useMemo(() => {
    const byName = channels.channels.filter((c) => c.nombre === channel?.nombre);
    return (byName.find((c) => c.codigo === p2p.nodeInfo?.code) ?? byName[0])?.codigo ?? p2p.nodeInfo?.code;
  }, [channels.channels, channel?.nombre, p2p.nodeInfo?.code]);

  return (
    <>
      <MainLayout
        layout={mods.layout}
        brand={<SidebarBrand status={p2p.status} peers={peers.length} />}
        search={<SearchBox value={query} onChange={setQuery} />}
        panels={{
          channels: (
            <ChannelsPanel
              channels={channels.channels}
              currentCode={activeCode}
              ownCode={channels.personalCode}
              selectedCode={channels.selectedCode}
              connectedCodes={p2p.peers}
              connectingCodes={channels.connectingCodes}
              onSwitch={channels.switchTo}
              onConnect={channels.connectTo}
              status={p2p.status}
              query={query}
            />
          ),
          users: <UsersPanel users={users.users} speaking={call.active && call.remoteSpeaking} query={query} />,
          invite: <InvitePanel code={p2p.nodeInfo?.code} onCopy={copyId} onConnect={p2p.connect} />,
        }}
        voice={
          <VoicePanel
            call={call}
            video={video}
            screen={screen}
            channelName={channel?.nombre || 'Chat P2P'}
            speakerName={peers.length === 1 ? peers[0].name : ''}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        }
        header={
          <AppHeader
            channel={channel}
            onlineUsers={onlineUsers}
            serverStarted={isStarted}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenServer={() => setServerOpen(true)}
            onRefreshMods={mods.reload}
            onOpenMods={mods.openFolder}
          />
        }
        chat={
          <>
            <VideoStage
              video={video}
              screen={screen}
              participants={participants}
              avatars={users.avatarByName}
              selfName={selfName}
              cfg={mods.layout.video}
            />
            <ChatHistory
              messages={chat.messages}
              avatars={users.avatarByName}
              selfName={selfName}
              serverStarted={isStarted}
              onStart={() => setServerOpen(true)}
              onReply={chat.setReplyTo}
              onReact={chat.react}
            />
            <ChatInput
              onSend={chat.send}
              onSendImage={chat.sendImage}
              channelName={channel?.nombre}
              replyTo={chat.replyTo}
              onCancelReply={() => chat.setReplyTo(null)}
            />
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
        call={call}
      />
      <ServerModal
        open={serverOpen}
        onClose={() => setServerOpen(false)}
        isStarted={isStarted}
        server={{
          port: p2p.port,
          onPortChange: p2p.setPort,
          onStart: p2p.startServer,
          channel,
          onSaveChannel: saveChannel,
          onSetChannelIcon: SetChannelIconFromDialog,
        }}
      />
      <Toast toast={toast} />
    </>
  );
}