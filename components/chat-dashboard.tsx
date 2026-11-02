"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Activity,
  Clapperboard,
  Hash,
  Headphones,
  MessageCircle,
  Plus,
  Phone,
  PhoneOff,
  Search,
  Settings2,
  Users,
  Video,
  X,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import {
  CallNotificationToggle,
  playCallChime,
} from "@/components/call-notification-toggle";
import {
  Channel,
  ChannelList as StreamChannelList,
  Chat,
  MessageComposer,
  MessageList,
  Thread,
  WithComponents,
  Window,
  useChatContext,
} from "stream-chat-react";
import { EmojiPicker } from "stream-chat-react/emojis";
import { StreamChat } from "stream-chat";
import {
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  PaginatedGridLayout,
  CallingState,
  useCalls,
  useCallStateHooks,
  type Call,
} from "@stream-io/video-react-sdk";
import "stream-chat-react/dist/css/index.css";
import "@stream-io/video-react-sdk/dist/css/styles.css";

type DashboardUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
};

type StreamBootstrap = {
  apiKey: string;
  token: string;
  user: { id: string; name: string; image: string };
};

export function ChatDashboard({ user }: { user: DashboardUser }) {
  const [bootstrap, setBootstrap] = useState<StreamBootstrap | null>(null);
  const [chatClient, setChatClient] = useState<StreamChat | null>(null);
  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [callNotice, setCallNotice] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let connectedChat: StreamChat | null = null;
    let connectedVideo: StreamVideoClient | null = null;

    async function initialize() {
      try {
        const response = await fetch("/api/stream/token");
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error ?? "Could not connect to Communichat");
        }

        const credentials = (await response.json()) as StreamBootstrap;
        if (cancelled) return;

        connectedChat = StreamChat.getInstance(credentials.apiKey);
        await connectedChat.connectUser(
          credentials.user,
          credentials.token,
        );

        connectedVideo = StreamVideoClient.getOrCreateInstance({
          apiKey: credentials.apiKey,
          user: credentials.user,
          token: credentials.token,
        });

        if (cancelled) {
          await connectedChat.disconnectUser();
          await connectedVideo.disconnectUser();
          return;
        }

        setBootstrap(credentials);
        setChatClient(connectedChat);
        setVideoClient(connectedVideo);
      } catch (error) {
        console.error("Unable to initialize Communichat", error);
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not connect to Communichat",
          );
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      if (connectedChat) void connectedChat.disconnectUser();
      if (connectedVideo) void connectedVideo.disconnectUser();
    };
  }, []);

  if (loadError) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-rose-400/10 text-rose-300">
            <Activity size={21} />
          </div>
          <h1 className="text-lg font-semibold">Could not load your workspace</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!chatClient || !videoClient || !bootstrap) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="size-2 animate-pulse rounded-full bg-violet-400" />
          Connecting to Communichat…
        </div>
      </div>
    );
  }

  return (
    <StreamVideo client={videoClient}>
      <Chat client={chatClient} theme="str-chat__theme-dark">
        <WithComponents overrides={{ EmojiPicker: ChatEmojiPicker }}>
          <div className="flex h-[100dvh] min-h-0 overflow-hidden">
            <AppSidebar />
            <section className="flex min-h-0 min-w-0 flex-1">
              <ChannelRail userId={user.id} />
              <ChatWindow
                onStartCall={(call) => {
                  setCallNotice("");
                  setActiveCall(call);
                }}
                videoClient={videoClient}
              />
            </section>
            {activeCall && videoClient && (
              <CallOverlay
                call={activeCall}
                cameraWarning={callNotice}
                onClose={() => {
                  setActiveCall(null);
                  setCallNotice("");
                }}
              />
            )}
            <IncomingCallPrompt
              onJoin={(call, warning) => {
                setCallNotice(warning ?? "");
                setActiveCall(call);
              }}
            />
          </div>
        </WithComponents>
      </Chat>
    </StreamVideo>
  );
}

function ChatEmojiPicker() {
  return (
    <EmojiPicker
      closeOnEmojiSelect
      placement="top-start"
      pickerProps={{ theme: "dark" }}
    />
  );
}

function AppSidebar() {
  return (
    <aside className="hidden w-[72px] shrink-0 flex-col items-center border-r border-white/[0.07] bg-[#0d0e14] py-5 lg:flex">
      <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-600 shadow-glow">
        <MessageCircle size={19} className="text-white" />
      </div>
      <div className="mt-9 flex flex-col gap-3">
        <SidebarButton label="Messages" active>
          <MessageCircle size={19} />
        </SidebarButton>
        <SidebarButton label="People">
          <Users size={19} />
        </SidebarButton>
        <SidebarButton label="Activity">
          <Activity size={19} />
        </SidebarButton>
      </div>
      <div className="mt-auto flex flex-col items-center gap-4">
        <SidebarButton label="Settings">
          <Settings2 size={19} />
        </SidebarButton>
        <div className="rounded-full border border-white/10 p-0.5">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "size-8",
                userButtonPopoverCard: "bg-[#171821] border border-white/10",
              },
            }}
          />
        </div>
      </div>
    </aside>
  );
}

function SidebarButton({
  children,
  label,
  active = false,
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`grid size-10 place-items-center rounded-xl transition ${
        active
          ? "bg-violet-400/15 text-violet-200"
          : "text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function ChannelRail({ userId }: { userId: string }) {
  const { channel } = useChatContext();
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <aside
      className={`${
        channel?.id ? "hidden md:flex" : "flex w-full md:w-[286px]"
      } min-h-0 shrink-0 flex-col border-r border-white/[0.07] bg-[#101117]`}
    >
      <div className="flex h-[76px] items-center justify-between border-b border-white/[0.07] px-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-violet-400/15 text-violet-200 sm:hidden">
              <MessageCircle size={14} />
            </span>
            Communichat
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Your workspace
          </div>
        </div>
        <button
          aria-label="Create a conversation"
          title="Create a conversation"
          onClick={() => window.dispatchEvent(new Event("communichat:new-chat"))}
          className="grid size-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-violet-300/40 hover:text-violet-200"
        >
          <Plus size={16} />
        </button>
        <div className="sm:hidden">
          <UserButton />
        </div>
      </div>

      <div className="border-b border-white/[0.06] p-3">
        <label className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-slate-500 focus-within:border-violet-300/40">
          <Search size={14} />
          <input
            type="search"
            aria-label="Search conversations"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search conversations"
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
          />
        </label>
      </div>

      <div className="flex items-center justify-between px-4 pb-2 pt-5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Conversations
        </span>
        <button
          aria-label="Add conversation"
          onClick={() => window.dispatchEvent(new Event("communichat:new-chat"))}
          className="text-slate-500 transition hover:text-violet-200"
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="flex min-h-0 min-w-0 w-full flex-1 overflow-hidden px-2">
        <WithComponents
          overrides={{ LoadingErrorIndicator: ChannelListLoadError }}
        >
          <StreamChannelList
            filters={{
              type: "messaging",
              members: { $in: [userId] },
            }}
            sort={{ last_message_at: -1 }}
            options={{ state: true, watch: true, presence: true }}
            channelRenderFilterFn={(channels) => {
              const query = searchQuery.trim().toLowerCase();
              if (!query) return channels;

              return channels.filter((item) => {
                const memberNames = Object.values(item.state.members)
                  .map((member) => member.user?.name ?? "")
                  .join(" ");
                const messages = item.state.messages
                  .map((message) => message.text ?? "")
                  .join(" ");
                return `${item.data?.name ?? ""} ${memberNames} ${messages}`
                  .toLowerCase()
                  .includes(query);
              });
            }}
            EmptyStateIndicator={ConversationEmptyState}
          />
        </WithComponents>
      </div>
      <div className="border-t border-white/[0.06] px-4 py-3 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          All systems operational
        </span>
      </div>
      <NewConversation />
    </aside>
  );
}

function ChannelListLoadError({ error }: { error?: Error | null }) {
  return (
    <div role="alert" className="grid h-full place-items-center px-6 text-center">
      <div className="max-w-xs">
        <Activity className="mx-auto mb-3 text-rose-300" size={22} />
        <p className="text-sm font-medium text-slate-200">
          Could not load conversations
        </p>
        <p className="mt-2 break-words text-xs leading-5 text-slate-400">
          {error?.message ?? "Check your connection and try again."}
        </p>
      </div>
    </div>
  );
}

function ConversationEmptyState() {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="max-w-xs">
        <MessageCircle
          className="mx-auto mb-3 text-violet-300"
          size={24}
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-slate-200">
          No conversations found
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Start a conversation with someone in your workspace.
        </p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("communichat:new-chat"))}
          className="mt-4 rounded-lg bg-violet-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-violet-400"
        >
          New conversation
        </button>
      </div>
    </div>
  );
}

function NewConversation() {
  const { client } = useChatContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [users, setUsers] = useState<
    Array<{ id: string; name?: string; image?: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const openModal = () => {
      setOpen(true);
      setError("");
    };
    window.addEventListener("communichat:new-chat", openModal);
    return () => window.removeEventListener("communichat:new-chat", openModal);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await client.queryUsers(
          query.trim()
            ? {
                $or: [
                  { name: { $autocomplete: query.trim() } },
                  { id: { $autocomplete: query.trim() } },
                ],
              }
            : {},
          { name: 1 },
          { limit: 20 },
        );
        setUsers(
          result.users
            .filter((candidate) => candidate.id !== client.userID)
            .map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
              image: candidate.image,
            })),
        );
      } catch (cause) {
        console.error("Unable to search workspace members", cause);
        setError("Could not load people. Please try again.");
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [client, open, query]);

  async function startConversation(memberId: string) {
    if (!client.userID) {
      setError("Your account is not connected. Please refresh and try again.");
      return;
    }

    setError("");
    try {
      const channel = client.channel("messaging", {
        members: [client.userID, memberId],
      });
      await channel.create();
      await channel.watch();
      setOpen(false);
      setQuery("");
      setSelectedUsers([]);
    } catch (cause) {
      console.error("Unable to create conversation", cause);
      setError("Could not start this conversation. Check Stream permissions.");
    }
  }

  async function startGroup() {
    if (!client.userID || selectedUsers.length < 2 || !groupName.trim()) return;
    setError("");
    try {
      const channel = client.channel("messaging", {
        name: groupName.trim(),
        members: [client.userID, ...selectedUsers],
      });
      await channel.create();
      await channel.watch();
      setOpen(false);
      setQuery("");
      setGroupName("");
      setSelectedUsers([]);
    } catch (cause) {
      console.error("Unable to create group channel", cause);
      setError("Could not create this channel. Check Stream permissions.");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section className="max-h-[calc(100dvh-2rem)] w-full max-w-md animate-fade-in overflow-y-auto rounded-2xl border border-white/10 bg-[#151620] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Start a conversation</h2>
            <p className="mt-1 text-xs text-slate-500">
              Find a teammate to message directly.
            </p>
          </div>
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 flex rounded-lg bg-black/20 p-1">
          <button
            onClick={() => setMode("direct")}
            className={`flex-1 rounded-md py-2 text-xs transition ${
              mode === "direct"
                ? "bg-white/10 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Direct message
          </button>
          <button
            onClick={() => setMode("group")}
            className={`flex-1 rounded-md py-2 text-xs transition ${
              mode === "group"
                ? "bg-white/10 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Group channel
          </button>
        </div>
        {mode === "group" && (
          <input
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="Channel name"
            className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-slate-600 focus:border-violet-400/50"
          />
        )}
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or username…"
          className="mt-5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-slate-600 focus:border-violet-400/50"
        />
        <div className="mt-3 max-h-64 overflow-y-auto">
          {loading && (
            <p className="px-2 py-4 text-center text-xs text-slate-500">
              Searching…
            </p>
          )}
          {!loading && users.length === 0 && !error && (
            <p className="px-2 py-4 text-center text-xs text-slate-500">
              No teammates found.
            </p>
          )}
          {users.map((candidate) => {
            const selected = selectedUsers.includes(candidate.id);
            return (
            <button
              key={candidate.id}
              onClick={() => {
                if (mode === "direct") {
                  void startConversation(candidate.id);
                  return;
                }
                setSelectedUsers((current) =>
                  selected
                    ? current.filter((id) => id !== candidate.id)
                    : [...current, candidate.id],
                );
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                selected ? "bg-violet-400/10" : "hover:bg-white/[0.05]"
              }`}
            >
              {candidate.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={candidate.image}
                  alt=""
                  className="size-9 rounded-full object-cover"
                />
              ) : (
                <div className="grid size-9 place-items-center rounded-full bg-violet-400/15 text-xs font-semibold text-violet-200">
                  {(candidate.name ?? candidate.id).slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-sm">
                {candidate.name ?? candidate.id}
              </span>
              {mode === "group" ? (
                <span
                  className={`grid size-4 place-items-center rounded border text-[10px] ${
                    selected
                      ? "border-violet-300 bg-violet-400 text-slate-950"
                      : "border-white/20"
                  }`}
                >
                  {selected ? "✓" : ""}
                </span>
              ) : (
                <MessageCircle size={15} className="text-slate-500" />
              )}
            </button>
            );
          })}
          {error && <p className="px-2 py-3 text-xs text-rose-300">{error}</p>}
        </div>
        {mode === "group" && (
          <button
            disabled={!groupName.trim() || selectedUsers.length < 2}
            onClick={() => void startGroup()}
            className="mt-3 h-10 w-full rounded-lg bg-violet-500 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create channel{selectedUsers.length > 0 ? ` · ${selectedUsers.length} selected` : ""}
          </button>
        )}
      </section>
    </div>
  );
}

function ChatWindow({
  onStartCall,
  videoClient,
}: {
  onStartCall: (call: Call) => void;
  videoClient: StreamVideoClient;
}) {
  const { channel } = useChatContext();

  return (
    <main
      className={`${
        channel?.id ? "flex" : "hidden md:flex"
      } relative min-w-0 flex-1 flex-col`}
    >
      <Channel>
        <Window>
          <div className="flex h-full min-h-0 flex-col">
            <WorkspaceHeader onStartCall={onStartCall} videoClient={videoClient} />
            <div className="min-h-0 flex-1 overflow-hidden">
              <MessageList />
            </div>
            <div className="flex items-end gap-2 border-t border-white/[0.06] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:py-3">
              <GiphyPicker />
              <div className="min-w-0 flex-1">
                <MessageComposer focus />
              </div>
            </div>
          </div>
        </Window>
        <Thread />
      </Channel>
    </main>
  );
}

function GiphyPicker() {
  const { channel } = useChatContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function sendGif(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channel || sending) return;

    setSending(true);
    setError("");
    try {
      const search = query.trim();
      await channel.sendMessage({ text: search ? `/giphy ${search}` : "/giphy" });
      setOpen(false);
      setQuery("");
    } catch (cause) {
      console.error("Unable to send Giphy command", cause);
      setError(
        "GIFs aren’t enabled for this channel. Enable the Giphy command in your Stream channel type settings.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative shrink-0">
      {open && (
        <form
          onSubmit={(event) => void sendGif(event)}
          className="absolute bottom-12 left-0 z-30 w-[min(320px,calc(100vw-2rem))] animate-fade-in rounded-xl border border-white/10 bg-[#151620] p-3 shadow-2xl"
        >
          <label
            htmlFor="giphy-search"
            className="text-xs font-medium text-slate-200"
          >
            Find a GIF
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="giphy-search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search GIFs, or leave blank for random"
              className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 text-xs outline-none placeholder:text-slate-600 focus:border-violet-400/50"
            />
            <button
              type="submit"
              disabled={sending || !channel}
              className="rounded-lg bg-violet-500 px-3 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
            >
              {sending ? "..." : "Send"}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[11px] leading-4 text-rose-300">
              {error}
            </p>
          )}
        </form>
      )}
      <button
        type="button"
        aria-label="Send a GIF"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setError("");
        }}
        disabled={!channel}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs font-semibold text-slate-400 transition hover:border-violet-300/40 hover:bg-violet-400/10 hover:text-violet-200 disabled:opacity-40"
      >
        <Clapperboard size={15} />
        GIF
      </button>
    </div>
  );
}

function WorkspaceHeader({
  onStartCall,
  videoClient,
}: {
  onStartCall: (call: Call) => void;
  videoClient: StreamVideoClient;
}) {
  const { channel, client, setActiveChannel } = useChatContext();
  const [startingCall, setStartingCall] = useState(false);
  const [callError, setCallError] = useState("");
  const channelName =
    channel?.data?.name ||
    (channel?.state.members &&
      Object.values(channel.state.members)
        .filter((member) => member.user?.id !== client.userID)
        .map((member) => member.user?.name)
        .filter(Boolean)
        .join(", ")) ||
    "Choose a conversation";

  async function startCall(videoEnabled: boolean) {
    if (!channel?.id || !client.userID) return;
    setStartingCall(true);
    setCallError("");
    let activeCall: Call | null = null;
    try {
      const call = videoClient.call(
        videoEnabled ? "default" : "audio_call",
        crypto.randomUUID(),
      );
      activeCall = call;
      await call.getOrCreate({
        ring: true,
        video: videoEnabled,
        data: {
          members: Object.keys(channel.state.members).map((id) => ({ user_id: id })),
        },
      });
      await call.join();
      if (videoEnabled) await call.camera.enable();
      onStartCall(call);
    } catch (error) {
      console.error("Unable to start call", error);
      if (activeCall) await activeCall.leave().catch((leaveError: unknown) => {
        console.error("Unable to clean up failed call", leaveError);
      });
      setCallError("Could not start the call. Check your Stream Video setup.");
    } finally {
      setStartingCall(false);
    }
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-3 sm:h-[76px] sm:px-7">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Back to conversations"
            onClick={() => setActiveChannel(undefined)}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white md:hidden"
          >
            <ArrowLeft size={17} />
          </button>
          {channel?.data?.name ? (
            <Hash size={16} className="shrink-0 text-violet-300" />
          ) : (
            <MessageCircle size={16} className="shrink-0 text-violet-300" />
          )}
          <h1 className="truncate text-sm font-semibold">{channelName}</h1>
        </div>
        {callError ? (
          <p role="alert" className="mt-1.5 truncate pl-6 text-[11px] text-rose-300">
            {callError}
          </p>
        ) : (
          <div className="mt-1.5 flex items-center gap-1.5 pl-6 text-[11px] text-slate-500">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Active now
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        <button
          aria-label="Start audio call"
          title="Request an audio call"
          disabled={!channel?.id || startingCall}
          onClick={() => void startCall(false)}
          className="grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        >
          <Headphones size={17} />
        </button>
        <button
          aria-label="Start video call"
          title={startingCall ? "Requesting call…" : "Request a video call"}
          disabled={!channel?.id || startingCall}
          onClick={() => void startCall(true)}
          className="grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        >
          <Video size={17} />
        </button>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <CallNotificationToggle />
        <div className="ml-1 sm:hidden">
          <UserButton />
        </div>
      </div>
    </header>
  );
}

function IncomingCallPrompt({
  onJoin,
}: {
  onJoin: (call: Call, cameraWarning?: string) => void;
}) {
  const calls = useCalls();
  const incomingCall = calls.find(
    (call) =>
      call.state.callingState === CallingState.RINGING && !call.isCreatedByMe,
  );
  const lastRingingCallId = useRef<string | null>(null);

  useEffect(() => {
    if (!incomingCall) {
      lastRingingCallId.current = null;
      return;
    }
    if (lastRingingCallId.current === incomingCall.cid) return;
    lastRingingCallId.current = incomingCall.cid;
    playCallChime();
  }, [incomingCall]);

  if (!incomingCall) return null;

  return (
    <IncomingCallDialog
      key={incomingCall.cid}
      call={incomingCall}
      onJoin={onJoin}
    />
  );
}

function IncomingCallDialog({
  call,
  onJoin,
}: {
  call: Call;
  onJoin: (call: Call, cameraWarning?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const callerName =
    call.state.createdBy?.name ?? "A teammate";

  async function acceptCall() {
    setBusy(true);
    setError("");
    try {
      await call.join();
      let cameraWarning = "";
      if (call.type !== "audio_call") {
        try {
          await call.camera.enable();
        } catch (cause) {
          console.error("Unable to enable camera for incoming call", cause);
          cameraWarning =
            "You joined without video. Allow camera access, then turn on your camera.";
        }
      }
      onJoin(call, cameraWarning);
    } catch (cause) {
      console.error("Unable to join incoming call", cause);
      setError("Could not join this call. Please try again.");
      setBusy(false);
    }
  }

  async function declineCall() {
    setBusy(true);
    setError("");
    try {
      await call.leave({ reject: true, reason: "decline" });
    } catch (cause) {
      console.error("Unable to decline incoming call", cause);
      setError("Could not decline this call.");
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] w-[min(360px,calc(100vw-2.5rem))]">
      <section
        role="status"
        aria-labelledby="incoming-call-title"
        className="pointer-events-auto animate-fade-in rounded-2xl border border-white/10 bg-[#151620]/95 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-violet-400/15 text-violet-200 ring-4 ring-violet-400/[0.06]">
            <Phone size={19} className="animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">
              Incoming call
            </p>
            <h2 id="incoming-call-title" className="mt-1 truncate text-sm font-semibold">
              {callerName}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Invited you to join a call
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-xs text-rose-300">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            disabled={busy}
            onClick={() => void declineCall()}
            className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-50"
          >
            <PhoneOff size={15} />
            Decline
          </button>
          <button
            disabled={busy}
            onClick={() => void acceptCall()}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
          >
            <Phone size={15} />
            {busy ? "Joining…" : "Join call"}
          </button>
        </div>
      </section>
    </div>
  );
}

function CallOverlay({
  call,
  cameraWarning,
  onClose,
}: {
  call: Call;
  cameraWarning: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-0 backdrop-blur-md sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden border border-white/10 bg-[#11121a] shadow-2xl sm:h-[min(760px,92vh)] sm:rounded-3xl">
        <StreamCall call={call}>
          <CallContent
            call={call}
            cameraWarning={cameraWarning}
            onClose={onClose}
          />
        </StreamCall>
      </div>
    </div>
  );
}

function CallContent({
  call,
  cameraWarning,
  onClose,
}: {
  call: Call;
  cameraWarning: string;
  onClose: () => void;
}) {
  const {
    useCallCallingState,
    useParticipantCount,
    useCameraState,
  } = useCallStateHooks();
  const callingState = useCallCallingState();
  const participantCount = useParticipantCount();
  const camera = useCameraState();

  useEffect(() => {
    call.setPreferredIncomingVideoResolution({ width: 1280, height: 720 });
  }, [call]);

  useEffect(() => {
    if (callingState === "left") onClose();
  }, [callingState, onClose]);

  return (
    <>
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
        <div>
          <p className="text-sm font-semibold">Communichat call</p>
          <p className="mt-1 text-xs text-slate-500">
            {participantCount} participant{participantCount === 1 ? "" : "s"}
          </p>
        </div>
        <button
          aria-label="Close call window"
          onClick={() => {
            void call.leave();
            onClose();
          }}
          className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X size={17} />
        </button>
      </header>
      {cameraWarning && !camera.isEnabled && (
        <p
          role="status"
          className="border-b border-amber-300/10 bg-amber-300/[0.06] px-6 py-2 text-xs text-amber-100/80"
        >
          {cameraWarning}
        </p>
      )}
      <div className="relative min-h-0 flex-1 p-2 sm:p-4">
        <CallStage />
      </div>
      <div className="flex shrink-0 justify-center border-t border-white/10 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:py-4">
        <CallControls onLeave={() => {
          void call.leave();
          onClose();
        }} />
      </div>
    </>
  );
}

function CallStage() {
  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden rounded-2xl bg-[#090a0f]">
      <PaginatedGridLayout groupSize={2} pageArrowsVisible={false} />
    </div>
  );
}

function CallControls({ onLeave }: { onLeave: () => void }) {
  const {
    useMicrophoneState,
    useCameraState,
    useScreenShareState,
  } = useCallStateHooks();
  const microphone = useMicrophoneState();
  const camera = useCameraState();
  const screenShare = useScreenShareState();

  return (
    <div className="flex items-center gap-3">
      <ControlButton
        label={microphone.isMute ? "Unmute microphone" : "Mute microphone"}
        onClick={() => void microphone.microphone.toggle()}
        active={!microphone.isMute}
      >
        <Headphones size={18} />
      </ControlButton>
      <ControlButton
        label={camera.isEnabled ? "Turn camera off" : "Turn camera on"}
        onClick={() => void camera.camera.toggle()}
        active={camera.isEnabled}
      >
        <Video size={18} />
      </ControlButton>
      <ControlButton
        label={screenShare.isEnabled ? "Stop sharing" : "Share screen"}
        onClick={() => void screenShare.screenShare.toggle()}
        active={screenShare.isEnabled}
      >
        <Activity size={18} />
      </ControlButton>
      <button
        aria-label="End call"
        onClick={onLeave}
        className="grid size-11 place-items-center rounded-full bg-rose-500 text-white transition hover:bg-rose-400"
      >
        <X size={19} />
      </button>
    </div>
  );
}

function ControlButton({
  children,
  label,
  active,
  onClick,
}: {
  children: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-11 place-items-center rounded-full transition ${
        active
          ? "bg-white/10 text-white hover:bg-white/15"
          : "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
      }`}
    >
      {children}
    </button>
  );
}
