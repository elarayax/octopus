import { useState, useCallback, useMemo } from 'react';
import { useToast, useMods, useProfile, useP2P, useChat, useVoiceCall, useVideoCall, useScreenShare, useUnread, useUsers, useChannel, useChannels, useMutedChannels, useShortcuts } from '../hooks';
import { STATUS } from '../hooks/useP2P';
import { SetChannelIconFromDialog } from '../../wailsjs/go/main/App';
import { Toast, IconPackProvider } from '../components/atoms';
import { SidebarTabs } from '../components/molecules';
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
  const users = useUsers();
  const selfName = users.users.find((u) => u.self)?.name || profile.username;
  const { channel, save: saveChannel } = useChannel();
  const mutedChannels = useMutedChannels();
  const channels = useChannels({
    // `chat` se declara más abajo; esta función solo corre después del primer render, así que ya existe
    onSwitch: () => {
      chat.reload();
      users.refresh();
    },
    onDeleted: (code) => mutedChannels.forget(code),
    notify,
    p2pStatus: p2p.status,
    connectedCodes: p2p.peers,
  });

  // Canal activo: por nombre (refleja el canal al que se cambió); ante empate, el del código propio
  const activeCode = useMemo(() => {
    const byName = channels.channels.filter((c) => c.nombre === channel?.nombre);
    return (byName.find((c) => c.codigo === p2p.nodeInfo?.code) ?? byName[0])?.codigo ?? p2p.nodeInfo?.code;
  }, [channels.channels, channel?.nombre, p2p.nodeInfo?.code]);

  const channelMuted = mutedChannels.isMuted(activeCode);
  // Contador + notificación del sistema (no suena si la ventana tiene foco o el canal está silenciado)
  const unread = useUnread({ muted: channelMuted, selfName });
  const chat = useChat({ notify, onIncoming: unread.onIncoming });
  const call = useVoiceCall({ notify });
  const video = useVideoCall({ notify });
  const screen = useScreenShare({ notify });

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

  // Cuántas personas MÁS (además de ti) están en la llamada de voz
  const othersInCall = call.members.filter((n) => peers.some((p) => p.name === n)).length;

  // Estado de micrófono / audio silenciado de quienes están en la llamada de voz.
  // Los demás vienen de la red (call.voiceStates); el tuyo, del estado local.
  const voiceStates = useMemo(() => {
    const states = { ...call.voiceStates };
    if (call.active && selfName) {
      states[selfName] = { muted: call.muted, deafened: call.deafened };
    }
    return states;
  }, [call.voiceStates, call.active, call.muted, call.deafened, selfName]);

  // ---- Pestañas Canales | Usuarios (se recuerda la última) ----
  const [sidebarTab, setSidebarTab] = useState(() => {
    try {
      return localStorage.getItem('octopus.sidebarTab') === 'users' ? 'users' : 'channels';
    } catch {
      return 'channels';
    }
  });
  const changeTab = useCallback((key) => {
    setSidebarTab(key);
    setQuery(''); // el buscador filtra la pestaña activa: al cambiar, se limpia
    try {
      localStorage.setItem('octopus.sidebarTab', key);
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  }, []);

  const toggleChannelMute = useCallback(() => {
    if (!activeCode) return;
    mutedChannels.toggle(activeCode);
    notify(channelMuted ? 'Notificaciones del canal activadas' : 'Canal silenciado', 'success');
  }, [activeCode, channelMuted, mutedChannels, notify]);

  useShortcuts({
    toggleMic: () => call.active && call.toggleMute(),
    toggleDeafen: () => call.active && call.toggleDeafen(),
    toggleChannelMute,
    showChannels: () => changeTab('channels'),
    showUsers: () => changeTab('users'),
  });

  // Si un mod apaga un panel, su pestaña desaparece
  const panelOn = (key) => mods.layout.panels?.[key] !== false;
  const tabs = [
    panelOn('channels') && { key: 'channels', label: 'Canales', icon: 'hash', count: channels.channels.length, title: 'Canales (Alt+1)' },
    panelOn('users') && { key: 'users', label: 'Usuarios', icon: 'users', count: `${onlineUsers.length}/${users.users.length}`, title: 'Usuarios (Alt+2)' },
  ].filter(Boolean);
  const activeTab = tabs.some((t) => t.key === sidebarTab) ? sidebarTab : tabs[0]?.key;

  return (
    <IconPackProvider pack={mods.layout.iconPack || 'default'} overrides={mods.layout.icons || {}}>
      <MainLayout
        layout={mods.layout}
        brand={<SidebarBrand status={p2p.status} peers={peers.length} />}
        search={
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder={activeTab === 'users' ? 'Buscar usuarios...' : 'Buscar canales...'}
          />
        }
        tabs={tabs.length > 1 && <SidebarTabs tabs={tabs} active={activeTab} onChange={changeTab} />}
        tabKeys={['channels', 'users']}
        activeTab={activeTab}
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
              onLeave={channels.leave}
              onDelete={channels.remove}
              mutedCodes={mutedChannels.muted}
              onToggleMute={mutedChannels.toggle}
              status={p2p.status}
              query={query}
            />
          ),
          users: (
            <UsersPanel
              users={users.users}
              speaking={call.active && call.remoteSpeaking}
              query={query}
              callMembers={call.members}
              memberStates={call.voiceStates}
              selfInCall={call.active}
              selfMuted={call.muted}
              selfDeafened={call.deafened}
            />
          ),
          invite: <InvitePanel code={p2p.nodeInfo?.code} onCopy={copyId} onConnect={p2p.connect} />,
        }}
        voice={
          <VoicePanel
            call={call}
            video={video}
            screen={screen}
            channelName={channel?.nombre || 'Chat P2P'}
            speakerName={peers.length === 1 ? peers[0].name : ''}
            othersInCall={othersInCall}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        }
        header={
          <AppHeader
            channel={channel}
            channelMuted={channelMuted}
            onToggleChannelMute={toggleChannelMute}
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
              voiceStates={voiceStates}
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
    </IconPackProvider>
  );
}