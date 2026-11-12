"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Activity,
  Camera,
  ChevronDown,
  Hash,
  Headphones,
  MessageCircle,
  Image as ImageIcon,
  Plus,
  Phone,
  PhoneOff,
  Search,
  Settings,
  SlidersHorizontal,
  Smile,
  Sun,
  Moon,
  Users,
  Video,
  X,
} from "lucide-react";
import { UserButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import {
  CallNotificationsToggle,
  CallSoundToggle,
  playMessageChime,
  showIncomingCallNotification,
  startCallRingtone,
  stopCallRingtone,
} from "@/components/call-sound-toggle";
import { joinIncomingCall } from "@/lib/join-incoming-call";
import { peopleSearchTerm } from "@/lib/people-search";
import { AppearanceProvider, AppearanceSettings } from "@/components/appearance-settings";
import {
  Channel,
  ChannelList as StreamChannelList,
  Chat,
  ChannelListItemUI,
  MessageComposer,
  MessageList,
  Thread,
  WithComponents,
  Window,
  type ChannelListItemUIProps,
  useChatContext,
} from "stream-chat-react";
import { EmojiPicker } from "stream-chat-react/emojis";
import { StreamChat, type Channel as StreamChannel } from "stream-chat";
import {
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  PaginatedGridLayout,
  SpeakerLayout,
  hasScreenShare,
  CallingState,
  useCalls,
  useCallStateHooks,
  type Call,
  type StreamVideoParticipant,
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
  user: { id: string; name: string; image: string; username: string };
};

type ColorTheme = "light" | "dark";
type GroupMenuAction = "members" | "rename";
type PendingIncomingCall = {
  call: Call;
  expiresAt: number;
  participants: Array<{ id: string; name: string; image: string | undefined }>;
};

type CameraFilter =
  | "none"
  | "mono"
  | "pop"
  | "vintage"
  | "warm"
  | "cool";
type FaceEmoji = "none" | "goofy" | "crying" | "scared";
type CameraBackground = "none" | "blur" | "mint" | "sunset" | "ocean";
type CameraEffects = {
  filter: CameraFilter;
  faceEmoji: FaceEmoji;
  background: CameraBackground;
};

const callJoinWindowMs = 5 * 60 * 1000;

async function searchPeople(search: string): Promise<Array<{ id: string; name?: string; image?: string }>> {
  const response = await fetch(`/api/people?q=${encodeURIComponent(search)}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(response.status === 429
      ? "Too many searches. Please wait a moment and try again."
      : "Could not search people. Please try again.");
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("users" in data) || !Array.isArray(data.users) ||
      !data.users.every((user: unknown) => user && typeof user === "object" && "id" in user && typeof user.id === "string")) {
    throw new Error("The people search returned an invalid response.");
  }
  return data.users;
}

function subscribeToMobileDevice() {
  return () => {};
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const cameraFilterCss: Record<Exclude<CameraFilter, "none">, string> = {
  mono: "grayscale(1)",
  pop: "saturate(2) contrast(1.15)",
  vintage: "sepia(0.65) contrast(1.1)",
  warm: "sepia(0.2) saturate(1.25)",
  cool: "hue-rotate(15deg) saturate(1.1)",
};

const faceEmojiText: Record<Exclude<FaceEmoji, "none">, string> = {
  goofy: "🤪",
  crying: "😭",
  scared: "😱",
};



function createCameraEffectFilter(
  effects: CameraEffects,
  onError: (message: string) => void,
) {
  return (input: MediaStream) => {
    if (
      effects.filter === "none" &&
      effects.faceEmoji === "none" &&
      effects.background === "none"
    ) {
      return { output: input };
    }

    let stopped = false;
    let frameCallback: number | null = null;
    let fallbackTimer: number | null = null;
    let inferencePending = false;
    let lastInferenceAt = 0;
    let lastDrawAt = 0;
    let video: HTMLVideoElement | null = null;
    let output: MediaStream | null = null;
    let worker: Worker | null = null;
    let faces: Array<{ x: number; y: number; width: number; height: number }> =
      [];
    let maskCanvas: HTMLCanvasElement | null = null;
    let maskWidth = 0;
    let maskHeight = 0;

    const stop = () => {
      stopped = true;
      if (frameCallback !== null && video && "cancelVideoFrameCallback" in video) {
        video.cancelVideoFrameCallback(frameCallback);
      }
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      video?.pause();
      if (video) video.srcObject = null;
      worker?.terminate();
      output?.getTracks().forEach((track) => track.stop());
    };

    const transformedStream = new Promise<MediaStream>((resolve, reject) => {
      if (!input.getVideoTracks().length) {
        reject(new Error("The camera stream has no video track."));
        return;
      }

      const videoElement = document.createElement("video");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      const foregroundCanvas = document.createElement("canvas");
      const foregroundContext = foregroundCanvas.getContext("2d");
      const inferenceCanvas = document.createElement("canvas");
      const inferenceContext = inferenceCanvas.getContext("2d");
      if (!context || typeof canvas.captureStream !== "function") {
        reject(new Error("This browser cannot process camera effects."));
        return;
      }
      if (!foregroundContext || !inferenceContext) {
        reject(new Error("This browser cannot process camera effects."));
        return;
      }

      video = videoElement;
      videoElement.autoplay = true;
      videoElement.muted = true;
      videoElement.playsInline = true;
      videoElement.srcObject = input;

      if (effects.faceEmoji !== "none" || effects.background !== "none") {
        worker = new Worker(
          new URL("./camera-effects.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (
          event: MessageEvent<{
            faces?: typeof faces;
            mask?: ArrayBuffer;
            maskWidth?: number;
            maskHeight?: number;
            error?: string;
          }>,
        ) => {
          inferencePending = false;
          if (event.data.error) {
            worker?.terminate();
            worker = null;
            faces = [];
            maskCanvas = null;
            onError("On-device camera effects could not be loaded.");
            return;
          }
          if (event.data.faces) faces = event.data.faces;
          if (
            event.data.mask &&
            event.data.maskWidth &&
            event.data.maskHeight
          ) {
            maskWidth = event.data.maskWidth;
            maskHeight = event.data.maskHeight;
            maskCanvas = document.createElement("canvas");
            maskCanvas.width = maskWidth;
            maskCanvas.height = maskHeight;
            const maskContext = maskCanvas.getContext("2d");
            if (!maskContext) {
              onError("Background effects are not supported in this browser.");
              return;
            }

            const values = new Float32Array(event.data.mask);
            const pixels = new Uint8ClampedArray(values.length * 4);
            for (let index = 0; index < values.length; index += 1) {
              const pixelIndex = index * 4;
              pixels[pixelIndex] = 255;
              pixels[pixelIndex + 1] = 255;
              pixels[pixelIndex + 2] = 255;
              pixels[pixelIndex + 3] = Math.round(
                Math.min(1, Math.max(0, values[index])) * 255,
              );
            }
            maskContext.putImageData(
              new ImageData(pixels, maskWidth, maskHeight),
              0,
              0,
            );
          }
        };
        worker.onerror = (error) => {
          console.error("Camera effects worker failed", error);
          worker?.terminate();
          worker = null;
          inferencePending = false;
          faces = [];
          maskCanvas = null;
          onError("On-device camera effects could not be loaded.");
        };
      }

      const render = (timestamp: number) => {
        if (stopped) return;
        if (timestamp - lastDrawAt >= 1000 / 24) {
          lastDrawAt = timestamp;
          const filter =
            effects.filter === "none"
              ? "none"
              : cameraFilterCss[effects.filter];
          context.clearRect(0, 0, canvas.width, canvas.height);

          if (effects.background === "blur") {
            context.filter = "blur(18px)";
            context.drawImage(
              videoElement,
              -18,
              -18,
              canvas.width + 36,
              canvas.height + 36,
            );
            context.filter = "none";
          } else if (effects.background !== "none") {
            const backgrounds: Record<
              Exclude<CameraBackground, "none" | "blur">,
              [string, string]
            > = {
              mint: ["#a7f3d0", "#0f766e"],
              sunset: ["#fdba74", "#be185d"],
              ocean: ["#7dd3fc", "#1d4ed8"],
            };
            const colors = backgrounds[effects.background];
            const gradient = context.createLinearGradient(
              0,
              0,
              canvas.width,
              canvas.height,
            );
            gradient.addColorStop(0, colors[0]);
            gradient.addColorStop(1, colors[1]);
            context.fillStyle = gradient;
            context.fillRect(0, 0, canvas.width, canvas.height);
          }

          if (
            effects.background === "none" ||
            !maskCanvas ||
            !maskWidth ||
            !maskHeight
          ) {
            context.filter = filter;
            context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            context.filter = "none";
          } else {
            foregroundContext.clearRect(
              0,
              0,
              foregroundCanvas.width,
              foregroundCanvas.height,
            );
            foregroundContext.filter = filter;
            foregroundContext.drawImage(
              videoElement,
              0,
              0,
              foregroundCanvas.width,
              foregroundCanvas.height,
            );
            foregroundContext.filter = "none";
            foregroundContext.globalCompositeOperation = "destination-in";
            foregroundContext.drawImage(
              maskCanvas,
              0,
              0,
              foregroundCanvas.width,
              foregroundCanvas.height,
            );
            foregroundContext.globalCompositeOperation = "source-over";
            context.drawImage(foregroundCanvas, 0, 0);
          }

          if (effects.faceEmoji !== "none") {
            context.textAlign = "center";
            context.textBaseline = "middle";
            for (const face of faces) {
              const faceCenterX =
                ((face.x + face.width / 2) / inferenceCanvas.width) *
                canvas.width;
              const faceCenterY =
                ((face.y + face.height * 0.48) / inferenceCanvas.height) *
                canvas.height;
              context.font = `${Math.max(
                36,
                (face.width / inferenceCanvas.width) * canvas.width * 0.82,
              )}px sans-serif`;
              context.fillText(
                faceEmojiText[effects.faceEmoji],
                faceCenterX,
                faceCenterY,
              );
            }
          }

          if (
            worker &&
            !inferencePending &&
            timestamp - lastInferenceAt >= 180 &&
            (effects.faceEmoji !== "none" || effects.background !== "none")
          ) {
            lastInferenceAt = timestamp;
            inferenceContext.drawImage(
              videoElement,
              0,
              0,
              inferenceCanvas.width,
              inferenceCanvas.height,
            );
            inferencePending = true;
            void createImageBitmap(inferenceCanvas)
              .then((image) => {
                if (stopped || !worker) {
                  image.close();
                  inferencePending = false;
                  return;
                }
                worker.postMessage(
                  {
                    id: timestamp,
                    image,
                    timestamp,
                    detectFaces: effects.faceEmoji !== "none",
                    segmentBackground: effects.background !== "none",
                  },
                  [image],
                );
              })
              .catch((error: unknown) => {
                inferencePending = false;
                console.error("Unable to prepare camera frame for effects", error);
                onError("On-device camera effects could not be loaded.");
              });
          }
        }

        if ("requestVideoFrameCallback" in videoElement) {
          frameCallback = videoElement.requestVideoFrameCallback(render);
        } else {
          fallbackTimer = window.setTimeout(
            () => render(performance.now()),
            1000 / 24,
          );
        }
      };

      videoElement.addEventListener(
        "loadedmetadata",
        () => {
          if (stopped) return;
          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          if (!canvas.width || !canvas.height) {
            stop();
            reject(new Error("The camera did not provide a usable video size."));
            return;
          }

          const scale = Math.min(1, 1280 / canvas.width, 720 / canvas.height);
          canvas.width = Math.round(canvas.width * scale);
          canvas.height = Math.round(canvas.height * scale);
          foregroundCanvas.width = canvas.width;
          foregroundCanvas.height = canvas.height;
          inferenceCanvas.width = Math.min(256, canvas.width);
          inferenceCanvas.height = Math.round(
            inferenceCanvas.width * (canvas.height / canvas.width),
          );
          output = canvas.captureStream(24);
          const stream = new MediaStream([
            ...output.getVideoTracks(),
            ...input.getAudioTracks(),
          ]);
          resolve(stream);
          render(performance.now());
        },
        { once: true },
      );
      void videoElement.play().catch((error: unknown) => {
        stop();
        reject(error);
      });
    });

    return { output: transformedStream, stop };
  };
}

async function readApiResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text();
  let result: unknown;
  try {
    result = JSON.parse(body);
  } catch {
    if (response.status === 404) {
      throw new Error(
        "The group settings API is missing from this deployment. Deploy the latest commit, then refresh.",
      );
    }
    throw new Error(
      `The group settings request returned an invalid response (HTTP ${response.status}). Check the deployment and try again.`,
    );
  }

  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("The server returned an invalid response. Please try again.");
  }
  return result as Record<string, unknown>;
}

function isGroupChannel(channel?: StreamChannel) {
  return Boolean(
    channel &&
      (channel.data?.is_group ||
        channel.data?.name ||
        (channel.data?.member_count ?? Object.keys(channel.state.members).length) >
          2),
  );
}

function getChannelDisplayName(channel: StreamChannel | undefined, userId?: string) {
  if (!channel) return "Choose a conversation";

  const channelName =
    typeof channel.data?.name === "string" ? channel.data.name.trim() : "";
  if (channelName) return channelName;
  if (isGroupChannel(channel)) return "Group chat";

  const memberNames = Object.values(channel.state.members)
    .filter((member) => member.user?.id !== userId)
    .map((member) => member.user?.name?.trim())
    .filter((name): name is string => Boolean(name));
  return memberNames.join(", ") || "Direct message";
}

function CommuniChatChannelListItem(props: ChannelListItemUIProps) {
  const { client } = useChatContext();
  return (
    <ChannelListItemUI
      {...props}
      displayTitle={getChannelDisplayName(props.channel, client.userID)}
    />
  );
}

function OpenChannelFromNotification() {
  const { client, setActiveChannel } = useChatContext();
  const handledCid = useRef<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const channelCid = url.searchParams.get("channel");
    if (!channelCid || handledCid.current === channelCid) return;
    const separatorIndex = channelCid.indexOf(":");
    if (separatorIndex < 1 || separatorIndex === channelCid.length - 1) return;

    handledCid.current = channelCid;
    let active = true;
    const channel = client.channel(
      channelCid.slice(0, separatorIndex),
      channelCid.slice(separatorIndex + 1),
    );
    void channel
      .watch()
      .then(() => {
        if (!active) return;
        setActiveChannel(channel);
        url.searchParams.delete("channel");
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      })
      .catch((error: unknown) => {
        console.error("Unable to open the chat from its notification", error);
      });

    return () => {
      active = false;
    };
  }, [client, setActiveChannel]);

  return null;
}

const themeStorageKey = "communichat:theme";

function getServerTheme(): ColorTheme {
  return "dark";
}

function getThemeSnapshot(): ColorTheme {
  if (typeof window === "undefined") return "dark";
  const preference = window.localStorage.getItem(themeStorageKey);
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribeToTheme(onChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("communichat:theme-change", onChange);
  mediaQuery.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("communichat:theme-change", onChange);
    mediaQuery.removeEventListener("change", onChange);
  };
}

function saveTheme(theme: ColorTheme) {
  window.localStorage.setItem(themeStorageKey, theme);
  window.dispatchEvent(new Event("communichat:theme-change"));
}

export function ChatDashboard({ user }: { user: DashboardUser }) {
  const { user: clerkUser, isLoaded: isClerkUserLoaded } = useUser();
  const clerkUserId = clerkUser?.id;
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerTheme,
  );
  const [bootstrap, setBootstrap] = useState<StreamBootstrap | null>(null);
  const [chatClient, setChatClient] = useState<StreamChat | null>(null);
  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(null);
  const [recoveredIncomingCall, setRecoveredIncomingCall] =
    useState<Call | null>(null);
  const [autoAcceptCallCid, setAutoAcceptCallCid] = useState<string | null>(null);
  const [notificationCallError, setNotificationCallError] = useState("");
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [pendingIncomingCall, setPendingIncomingCall] =
    useState<PendingIncomingCall | null>(null);
  const [callNotice, setCallNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const openedNotificationCall = useRef<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    async function removeLegacyPushSubscription() {
      if (!("serviceWorker" in navigator)) return;

      const registrations = await navigator.serviceWorker.getRegistrations();
      const legacyWorkerUrl = new URL("/sw.js", window.location.origin).href;
      for (const registration of registrations) {
        const workers = [
          registration.active,
          registration.waiting,
          registration.installing,
        ];
        if (
          !workers.some((worker) => worker?.scriptURL === legacyWorkerUrl) ||
          cancelled
        ) {
          continue;
        }

        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          try {
            const response = await fetch("/api/push-subscriptions", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint: subscription.endpoint }),
            });
            if (!response.ok) {
              console.error(
                "Unable to remove the old push subscription",
                await response.text(),
              );
            }
          } catch (error) {
            console.error("Unable to remove the old push subscription", error);
          }

          try {
            const unsubscribed = await subscription.unsubscribe();
            if (!unsubscribed) {
              console.error("The old push subscription could not be removed");
            }
          } catch (error) {
            console.error("Unable to unsubscribe from old push notifications", error);
          }
        }

        const unregistered = await registration.unregister();
        if (!unregistered) {
          console.error("The old push service worker could not be unregistered");
        }
      }
    }

    void removeLegacyPushSubscription().catch((error: unknown) => {
      console.error("Unable to remove old push notification settings", error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isClerkUserLoaded || !clerkUserId || !chatClient) return;
    let cancelled = false;

    async function syncProfile() {
      try {
        const response = await fetch("/api/stream/token", { method: "POST" });
        if (!response.ok) {
          throw new Error(
            `Profile sync failed: ${response.status} ${await response.text()}`,
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to sync profile photo with chat", error);
        }
      }
    }

    void syncProfile();
    return () => {
      cancelled = true;
    };
  }, [
    chatClient,
    clerkUserId,
    clerkUser?.firstName,
    clerkUser?.imageUrl,
    clerkUser?.lastName,
    clerkUser?.username,
    isClerkUserLoaded,
  ]);

  useEffect(() => {
    if (!chatClient) return;
    const subscription = chatClient.on("message.new", (event) => {
      const senderId = event.user?.id ?? event.message?.user?.id;
      if (
        senderId === chatClient.userID ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      void playMessageChime();
    });
    return () => subscription.unsubscribe();
  }, [chatClient]);

  useEffect(() => {
    const bridge = (
      window as Window & {
        AndroidBridge?: { onReactReady: () => void };
      }
    ).AndroidBridge;
    bridge?.onReactReady();
  }, []);

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
        if (!new URL(window.location.href).searchParams.has("call")) {
          void connectedVideo
          .queryCalls({
            filter_conditions: {
              members: { $in: [credentials.user.id] },
              ongoing: { $eq: true },
            },
            limit: 10,
            sort: [{ field: "created_at", direction: -1 }],
            watch: true,
          })
          .then(({ calls }) => {
            if (cancelled) return;
            setRecoveredIncomingCall(
              calls.find((call) => !call.isCreatedByMe) ?? null,
            );
          })
          .catch((error: unknown) => {
            console.error("Unable to check for active incoming calls", error);
          });
        }

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

  useEffect(() => {
    if (!chatClient) return;
    const androidWindow = window as Window & {
      AndroidBridge?: unknown;
      communiChatAndroidVisible?: boolean;
    };
    if (!androidWindow.AndroidBridge) return;

    let active = true;
    let closing = Promise.resolve();
    let needsRecovery = false;
    const isAppVisible = () => androidWindow.communiChatAndroidVisible !== false;
    const updateConnection = () => {
      if (!isAppVisible()) {
        needsRecovery = true;
        closing = chatClient.closeConnection().catch((error: unknown) => {
          console.error("Unable to close Android chat connection", error);
        });
      } else {
        void closing.then(async () => {
          if (active && isAppVisible()) {
            await chatClient.openConnection();
            if (active && isAppVisible() && needsRecovery) {
              await chatClient.recoverState();
              needsRecovery = false;
            }
          }
        }).catch((error: unknown) => {
          console.error("Unable to reopen Android chat connection", error);
        });
      }
    };
    window.addEventListener("communichat:android-visibility", updateConnection);
    updateConnection();
    return () => {
      active = false;
      window.removeEventListener("communichat:android-visibility", updateConnection);
    };
  }, [chatClient]);

  useEffect(() => {
    if (!videoClient) return;
    const url = new URL(window.location.href);
    const callCid = url.searchParams.get("call");
    if (!callCid || openedNotificationCall.current === callCid) return;
    const shouldAccept = url.searchParams.get("acceptCall") === "1";
    openedNotificationCall.current = callCid;
    let cancelled = false;
    let resolved = false;

    void videoClient
      .onRingingCall(callCid)
      .then((call) => {
        if (cancelled) return;
        resolved = true;
        setNotificationCallError("");
        setAutoAcceptCallCid(shouldAccept ? callCid : null);
        setRecoveredIncomingCall(call);
        url.searchParams.delete("call");
        url.searchParams.delete("acceptCall");
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      })
      .catch((error: unknown) => {
        console.error("Unable to open the call from its notification", error);
        if (!cancelled) {
          setNotificationCallError(
            "Could not open this call. It may have ended; please try again.",
          );
        }
      });

    return () => {
      cancelled = true;
      if (!resolved && openedNotificationCall.current === callCid) {
        openedNotificationCall.current = null;
      }
    };
  }, [videoClient]);

  if (loadError) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-rose-400/10 text-rose-300">
            <Activity size={21} />
          </div>
          <h1 className="text-lg font-semibold">Could not load </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!chatClient || !videoClient || !bootstrap) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
          Connecting to Communichat…
        </div>
      </div>
    );
  }

  return (
    <StreamVideo client={videoClient}>
      <Chat client={chatClient} theme={`str-chat__theme-${theme}`}>
        <OpenChannelFromNotification />
        <WithComponents
          overrides={{
            EmojiPicker: () => <ChatEmojiPicker theme={theme} />,
          }}
        >
          <div
            data-theme={theme}
            className="communichat-shell flex h-[100dvh] min-h-0 overflow-hidden"
          >
            <AppSidebar />
            <section className="flex min-h-0 min-w-0 flex-1">
              <ChannelRail
                userId={user.id}
                theme={theme}
                onToggleTheme={() =>
                  saveTheme(theme === "dark" ? "light" : "dark")
                }
              />
              <ChatWindow
                onStartCall={(call) => {
                  setCallNotice("");
                  setActiveCall(call);
                }}
                videoClient={videoClient}
                theme={theme}
                onToggleTheme={() =>
                  saveTheme(theme === "dark" ? "light" : "dark")
                }
              />
            </section>
            {activeCall && videoClient && (
              <CallOverlay
                call={activeCall}
                cameraWarning={callNotice}
                theme={theme}
                onClose={() => {
                  setActiveCall(null);
                  setCallNotice("");
                }}
              />
            )}
            <IncomingCallPrompt
              recoveredCall={recoveredIncomingCall}
              autoAcceptCallCid={autoAcceptCallCid}
              onDecline={(call, participants) => {
                setAutoAcceptCallCid(null);
                setPendingIncomingCall({
                  call,
                  participants,
                  expiresAt: Date.now() + callJoinWindowMs,
                });
                setRecoveredIncomingCall(null);
              }}
              onJoin={(call, warning) => {
                setAutoAcceptCallCid(null);
                setRecoveredIncomingCall(null);
                setPendingIncomingCall(null);
                setCallNotice(warning ?? "");
                setActiveCall(call);
              }}
            />
            {notificationCallError && (
              <div role="alert" className="fixed bottom-5 left-5 z-[70] rounded-lg bg-rose-900 p-4 text-sm text-white">
                {notificationCallError}
                <button className="ml-3 underline" onClick={() => setNotificationCallError("")}>
                  Dismiss
                </button>
              </div>
            )}
            {pendingIncomingCall && (
              <DeclinedCallBanner
                pendingCall={pendingIncomingCall}
                videoClient={videoClient}
                onJoin={(call, warning) => {
                  setPendingIncomingCall(null);
                  setCallNotice(warning ?? "");
                  setActiveCall(call);
                }}
                onExpire={() => setPendingIncomingCall(null)}
              />
            )}
          </div>
        </WithComponents>
      </Chat>
    </StreamVideo>
  );
}

function ChatEmojiPicker({ theme }: { theme: ColorTheme }) {
  return (
    <EmojiPicker
      closeOnEmojiSelect
      placement="top-start"
      pickerProps={{ theme }}
    />
  );
}

function AppSidebar() {
  return (
    <aside className="hidden w-[72px] shrink-0 flex-col items-center border-r border-white/[0.07] bg-[#0d0e14] py-5 lg:flex">
      <Image
        src="/communichat-logo.png"
        alt="CommuniChat"
        width={44}
        height={44}
        className="size-10 rounded-2xl object-cover shadow-glow"
        priority
      />
      <div className="mt-9 flex flex-col gap-3">
        <SidebarButton label="Messages" active>
          <MessageCircle size={19} />
        </SidebarButton>
      </div>
      <div className="mt-auto rounded-full border border-white/10 p-0.5">
        <UserButton />
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
          ? "bg-emerald-400/15 text-emerald-200"
          : "text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function ChannelRail({
  userId,
  theme,
  onToggleTheme,
}: {
  userId: string;
  theme: ColorTheme;
  onToggleTheme: () => void;
}) {
  const { channel } = useChatContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [newlyCreatedChannel, setNewlyCreatedChannel] =
    useState<StreamChannel | null>(null);

  return (
    <aside
      className={`${
        channel?.id ? "hidden md:flex" : "flex w-full md:w-[286px]"
      } min-h-0 shrink-0 flex-col border-r border-white/[0.07] bg-[#101117]`}
    >
      <div className="flex h-[76px] items-center justify-between border-b border-white/[0.07] px-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Image
              src="/communichat-logo.png"
              alt=""
              width={28}
              height={28}
              className="size-7 rounded-lg object-cover sm:hidden"
            />
            Communichat
          </div>
        </div>
        <button
          aria-label="Create a conversation"
          title="Create a conversation"
          onClick={() => window.dispatchEvent(new Event("communichat:new-chat"))}
          className="grid size-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-emerald-300/40 hover:text-emerald-600"
        >
          <Plus size={16} />
        </button>
        <div className={channel?.id ? "hidden" : "block"}>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <div className="ml-1 md:hidden">
          <UserButton />
        </div>
      </div>

      <div className="border-b border-white/[0.06] p-3">
        <label         className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-slate-500 focus-within:border-emerald-300/40">
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
          className="text-slate-500 transition hover:text-emerald-600"
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="flex min-h-0 min-w-0 w-full flex-1 overflow-hidden px-2">
        <WithComponents
          overrides={{
            LoadingErrorIndicator: ChannelListLoadError,
            ChannelListItemUI: CommuniChatChannelListItem,
          }}
        >
          <StreamChannelList
            filters={{
              type: "messaging",
              members: { $in: [userId] },
            }}
            sort={{ created_at: -1 }}
            options={{ state: true, watch: true, presence: true }}
            channelRenderFilterFn={(channels) => {
              const query = searchQuery.trim().toLowerCase();
              const listedChannels =
                newlyCreatedChannel &&
                !channels.some((item) => item.cid === newlyCreatedChannel.cid)
                  ? [newlyCreatedChannel, ...channels]
                  : channels;
              if (!query) return listedChannels;

              return listedChannels.filter((item) => {
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
      <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-3 text-[11px] text-slate-600">
        <span className="block">WinTech Companies</span>
        <div className={channel?.id ? "hidden" : "flex items-center gap-1"}>
          <CallSoundToggle />
          <CallNotificationsToggle />
        </div>
      </div>
      <NewConversation
        onChannelCreated={setNewlyCreatedChannel}
      />
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
          className="mx-auto mb-3 text-emerald-600"
          size={24}
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-slate-200">
          No conversations found
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Start a conversation with someone.
        </p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("communichat:new-chat"))}
          className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-500"
        >
          New conversation
        </button>
      </div>
    </div>
  );
}

function NewConversation({
  onChannelCreated,
}: {
  onChannelCreated: (channel: StreamChannel) => void;
}) {
  const { client, setActiveChannel } = useChatContext();
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
    let active = true;
    const search = peopleSearchTerm(query);
    if (!search) {
      return () => {
        active = false;
      };
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await searchPeople(search);
        if (active) setUsers(
          result
            .filter((candidate) => candidate.id !== client.userID)
            .map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
              image: candidate.image,
            })),
        );
      } catch (cause) {
        console.error("Unable to search workspace members", cause);
        if (active) setError(cause instanceof Error ? cause.message : "Could not load people. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
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
      setActiveChannel(channel);
      onChannelCreated(channel);
      setOpen(false);
      setQuery("");
      setUsers([]);
      setLoading(false);
      setSelectedUsers([]);
    } catch (cause) {
      console.error("Unable to create conversation", cause);
      setError("Could not start this conversation. Check Stream permissions.");
    }
  }

  async function startGroup() {
    if (!client.userID || selectedUsers.length < 1 || !groupName.trim()) return;
    setError("");
    try {
      const channel = client.channel(
        "messaging",
        crypto.randomUUID(),
        {
          name: groupName.trim(),
          is_group: true,
          members: [
            { user_id: client.userID, channel_role: "channel_moderator" },
            ...selectedUsers.map((userId) => ({
              user_id: userId,
              channel_role: "channel_member" as const,
            })),
          ],
        },
      );
      await channel.create();
      await channel.watch();
      setActiveChannel(channel);
      onChannelCreated(channel);
      setOpen(false);
      setQuery("");
      setUsers([]);
      setLoading(false);
      setGroupName("");
      setSelectedUsers([]);
    } catch (cause) {
      console.error("Unable to create group channel", cause);
      setError(
        cause instanceof Error
          ? `Could not create this group: ${cause.message}`
          : "Could not create this group. Please try again.",
      );
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
                ? "bg-white/10 text-slate-200"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Direct message
          </button>
          <button
            onClick={() => setMode("group")}
            className={`flex-1 rounded-md py-2 text-xs transition ${
              mode === "group"
                ? "bg-white/10 text-slate-200"
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
            className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
          />
        )}
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setUsers([]);
            setLoading(false);
            setError("");
            setQuery(event.target.value);
          }}
          placeholder="Search by name or username…"
          className="mt-5 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
        />
        <div className="mt-3 max-h-64 overflow-y-auto">
          {loading && (
            <p className="px-2 py-4 text-center text-xs text-slate-500">
              Searching…
            </p>
          )}
          {!loading && users.length === 0 && !error && (
            <p className="px-2 py-4 text-center text-xs text-slate-500">
              {peopleSearchTerm(query) ? "No people found." : "Enter at least 2 characters to search."}
            </p>
          )}
          {query.trim() && users.map((candidate) => {
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
                selected ? "bg-emerald-400/10" : "hover:bg-white/[0.05]"
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
                <div className="grid size-9 place-items-center rounded-full bg-emerald-400/15 text-xs font-semibold text-emerald-200">
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
                      ? "border-emerald-500 bg-emerald-400 text-emerald-950"
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
            disabled={!groupName.trim() || selectedUsers.length < 1}
            onClick={() => void startGroup()}
            className="mt-3 h-10 w-full rounded-lg bg-emerald-600 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create group{selectedUsers.length > 0 ? ` · ${selectedUsers.length} selected` : ""}
          </button>
        )}
      </section>
    </div>
  );
}

function ChatWindow({
  onStartCall,
  videoClient,
  theme,
  onToggleTheme,
}: {
  onStartCall: (call: Call) => void;
  videoClient: StreamVideoClient;
  theme: ColorTheme;
  onToggleTheme: () => void;
}) {
  const { channel, client } = useChatContext();

  return (
    <main
      className={`${
        channel?.id ? "flex" : "hidden md:flex"
      } relative min-w-0 flex-1 flex-col`}
    >
      <Channel>
        <Window>
          <AppearanceProvider userId={client.userID ?? ""}>
            <WorkspaceHeader
              onStartCall={onStartCall}
              videoClient={videoClient}
              theme={theme}
              onToggleTheme={onToggleTheme}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              <MessageList />
            </div>
            <div className="flex items-end gap-2 border-t border-white/[0.06] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:py-3">
              <div className="min-w-0 flex-1">
                <MessageComposer focus />
              </div>
            </div>
          </AppearanceProvider>
        </Window>
        <Thread />
      </Channel>
    </main>
  );
}

function WorkspaceHeader({
  onStartCall,
  videoClient,
  theme,
  onToggleTheme,
}: {
  onStartCall: (call: Call) => void;
  videoClient: StreamVideoClient;
  theme: ColorTheme;
  onToggleTheme: () => void;
}) {
  const { channel, client, setActiveChannel } = useChatContext();
  const [startingCall, setStartingCall] = useState(false);
  const [callError, setCallError] = useState("");
  const [groupAction, setGroupAction] = useState<{
    action: GroupMenuAction;
    channelId: string;
  } | null>(null);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [presenceRevision, setPresenceRevision] = useState(0);
  const [groupAccess, setGroupAccess] = useState<{
    channelId: string;
    creatorId: string | null;
    isAdmin: boolean;
    canManageRoles: boolean;
  } | null>(null);
  const channelId = channel?.id;
  const isGroup = isGroupChannel(channel);

  useEffect(() => {
    const subscription = client.on("user.presence.changed", () => {
      setPresenceRevision((revision) => revision + 1);
    });
    return () => subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    if (!channelId || !isGroup) return;
    const groupChannelId = channelId;

    let active = true;

    async function loadGroupAccess() {
      try {
        const response = await fetch(
          `/api/stream/channels/${encodeURIComponent(groupChannelId)}/members`,
        );
        const result = await readApiResponse(response);
        if (
          !response.ok ||
          typeof result.isAdmin !== "boolean" ||
          typeof result.canManageRoles !== "boolean"
        ) {
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : "Could not load group permissions.",
          );
        }
        if (active) {
          setGroupAccess({
            channelId: groupChannelId,
            creatorId:
              typeof result.creatorId === "string" ? result.creatorId : null,
            isAdmin: result.isAdmin,
            canManageRoles: result.canManageRoles,
          });
        }
      } catch (error) {
        console.error("Unable to load group permissions", error);
      }
    }

    void loadGroupAccess();
    return () => {
      active = false;
    };
  }, [channelId, isGroup, client.userID]);

  const otherMembers = Object.values(channel?.state.members ?? {}).filter(
    (member) => member.user?.id !== client.userID,
  );
  const presenceAvailable =
    otherMembers.length > 0 &&
    otherMembers.every((member) => typeof member.user?.online === "boolean");
  const onlineCount = otherMembers.filter((member) => member.user?.online).length;
  const presence = channel?.id
    ? {
        label: !presenceAvailable
          ? "Presence unavailable"
          : isGroup
            ? `${onlineCount} online`
            : onlineCount > 0
              ? "Online"
              : "Offline",
        online: presenceAvailable && onlineCount > 0,
      }
    : null;

  const channelName = getChannelDisplayName(channel, client.userID);
  const hasGroupAccess = groupAccess?.channelId === channel?.id;
  const creatorId = hasGroupAccess
    ? groupAccess?.creatorId ?? undefined
    : channel?.data?.created_by_id;
  const isGroupAdmin = Boolean(hasGroupAccess && groupAccess?.isAdmin);

  function openGroupAction(action: GroupMenuAction) {
    if (!channel?.id) return;
    setGroupSettingsOpen(false);
    setGroupAction({ action, channelId: channel.id });
    if (action === "rename") {
      setRenameName(channel.data?.name ?? "");
      setRenameError("");
    }
  }

  async function renameGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channel?.id || !renameName.trim()) return;

    setRenaming(true);
    setRenameError("");
    try {
      const response = await fetch(
        `/api/stream/channels/${encodeURIComponent(channel.id)}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rename", name: renameName.trim() }),
        },
      );
      const result = await readApiResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Could not rename this group.",
        );
      }

      await channel.watch();
      setGroupAction(null);
      setRenameName("");
    } catch (error) {
      console.error("Unable to rename group", error);
      setRenameError(
        error instanceof Error ? error.message : "Could not rename this group.",
      );
    } finally {
      setRenaming(false);
    }
  }

  async function startCall(videoEnabled: boolean) {
    if (!channel?.id || !client.userID) return;
    setStartingCall(true);
    setCallError("");
    let activeCall: Call | null = null;
    try {
      const call = videoClient.call(
        "default",
        crypto.randomUUID(),
      );
      activeCall = call;
      await call.getOrCreate({
        ring: true,
        video: videoEnabled,
        data: {
          members: Object.keys(channel.state.members).map((id) => ({
            user_id: id,
          })),
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
      setCallError(
        error instanceof Error
          ? `Call failed: ${error.message}`
          : "Could not start the call. Check your Stream Video setup.",
      );
    } finally {
      setStartingCall(false);
    }
  }

  return (
    <>
    <header className="communichat-header flex min-h-16 shrink-0 items-center justify-between gap-1 border-b border-white/[0.07] px-2 sm:min-h-[76px] sm:gap-2 sm:px-7">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Back to conversations"
            onClick={() => setActiveChannel(undefined)}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white md:hidden"
          >
            <ArrowLeft size={22} />
          </button>
          {channel?.data?.name ? (
            <Hash size={20} className="shrink-0 text-emerald-500" />
          ) : (
            <MessageCircle size={20} className="shrink-0 text-emerald-500" />
          )}
          <h1 className="truncate text-sm font-semibold">{channelName}</h1>
        </div>
        {callError ? (
          <p
            role="alert"
            className="mt-1.5 max-w-[min(60vw,32rem)] break-words pl-6 text-[11px] text-rose-300"
            title={callError}
          >
            {callError}
          </p>
        ) : (
          presence && (
            <div
              key={presenceRevision}
              className="mt-1.5 flex items-center gap-1.5 pl-6 text-[11px] text-slate-500"
            >
              <span
                className={`size-1.5 rounded-full ${
                  presence.online ? "bg-emerald-400" : "bg-slate-500"
                }`}
              />
              {presence.label}
            </div>
          )
        )}
      </div>
      <div className="communichat-header-actions flex min-w-0 flex-wrap justify-end items-center gap-0.5 sm:gap-1.5">
        <AppearanceSettings />
        <div className={channel?.id ? "block" : "hidden"}>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        {isGroup && isGroupAdmin && (
          <div className="relative">
            <button
              type="button"
              aria-label="Group settings"
              aria-haspopup="menu"
              aria-expanded={groupSettingsOpen}
              title="Group settings"
              onClick={() => setGroupSettingsOpen((open) => !open)}
              className="flex h-10 items-center gap-1 rounded-lg px-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              <Settings size={22} />
              <ChevronDown size={16} />
            </button>
            {groupSettingsOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-2 w-48 rounded-xl border border-white/10 bg-[#171821] p-1.5 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openGroupAction("members")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]"
                >
                  <Users size={15} />
                  Manage members
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openGroupAction("rename")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]"
                >
                  <Hash size={15} />
                  Rename group
                </button>
              </div>
            )}
          </div>
        )}
        <button
          aria-label="Start audio call"
          title="Request an audio call"
          disabled={!channel?.id || startingCall}
          onClick={() => void startCall(false)}
          className="grid size-10 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        >
          <Headphones size={22} />
        </button>
        <button
          aria-label="Start video call"
          title={startingCall ? "Requesting call…" : "Request a video call"}
          disabled={!channel?.id || startingCall}
          onClick={() => void startCall(true)}
          className="grid size-10 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        >
          <Video size={22} />
        </button>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <CallSoundToggle />
        <CallNotificationsToggle />
        <div className="ml-1 lg:hidden">
          <UserButton />
        </div>
      </div>
    </header>
    {groupAction?.action === "members" &&
      channel?.id === groupAction.channelId &&
      isGroup &&
      isGroupAdmin &&
      client.userID && (
      <GroupMemberManager
        channel={channel}
        channelId={channel.id}
        creatorId={creatorId ?? ""}
        currentUserId={client.userID}
        canManageRoles={Boolean(
          hasGroupAccess && groupAccess?.canManageRoles,
        )}
        onClose={() => setGroupAction(null)}
      />
    )}
    {groupAction?.action === "rename" &&
      channel?.id === groupAction.channelId &&
      isGroup &&
      isGroupAdmin && (
      <div
        className="fixed inset-0 z-[60] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !renaming) {
            setGroupAction(null);
          }
        }}
      >
        <form
          onSubmit={(event) => void renameGroup(event)}
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151620] p-5 shadow-2xl"
        >
          <h2 className="text-sm font-semibold">Rename group</h2>
          <label
            htmlFor="rename-group"
            className="mt-4 block text-xs text-slate-400"
          >
            Group name
          </label>
          <input
            id="rename-group"
            autoFocus
            maxLength={80}
            value={renameName}
            onChange={(event) => setRenameName(event.target.value)}
            className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-emerald-500/50"
          />
          {renameError && (
            <p role="alert" className="mt-2 text-xs text-rose-300">
              {renameError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={renaming}
              onClick={() => setGroupAction(null)}
              className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.06] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={renaming || !renameName.trim()}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {renaming ? "Saving…" : "Save name"}
            </button>
          </div>
        </form>
      </div>
    )}
    </>
  );
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: ColorTheme;
  onToggle: () => void;
}) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={onToggle}
      className="grid size-10 shrink-0 place-items-center rounded-lg text-emerald-500 transition hover:bg-emerald-500/10"
    >
      {theme === "dark" ? <Sun size={21} /> : <Moon size={21} />}
    </button>
  );
}

type GroupMemberAction = "add" | "remove" | "promote" | "demote";

function GroupMemberManager({
  channel,
  channelId,
  creatorId,
  currentUserId,
  canManageRoles,
  onClose,
}: {
  channel: StreamChannel;
  channelId: string;
  creatorId: string;
  currentUserId: string;
  canManageRoles: boolean;
  onClose: () => void;
}) {
  const { client } = useChatContext();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<
    Array<{ id: string; name?: string; image?: string }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [busyUserId, setBusyUserId] = useState("");
  const [error, setError] = useState("");
  const members = Object.values(channel.state.members);

  useEffect(() => {
    let active = true;
    const search = peopleSearchTerm(query);
    if (!search) {
      return () => {
        active = false;
      };
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const result = await searchPeople(search);
        if (active) {
          setUsers(
            result
              .filter((user) => user.id !== currentUserId)
              .map((user) => ({
                id: user.id,
                name: user.name,
                image: user.image,
              })),
          );
        }
      } catch (cause) {
        console.error("Unable to search group members", cause);
        if (active) setError(cause instanceof Error ? cause.message : "Could not search people. Please try again.");
      } finally {
        if (active) setSearching(false);
      }
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, currentUserId, query]);

  async function updateMember(action: GroupMemberAction, userId: string) {
    setBusyUserId(userId);
    setError("");
    try {
      const response = await fetch(
        `/api/stream/channels/${encodeURIComponent(channelId)}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, userId }),
        },
      );
      const result = await readApiResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Could not update group members.",
        );
      }
      await channel.watch();
    } catch (cause) {
      console.error("Unable to update group members", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update group members. Please try again.",
      );
    } finally {
      setBusyUserId("");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-members-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#151620] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="group-members-title" className="text-sm font-semibold">
              Manage group members
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Group admins can add or remove members. Only the creator can
              promote or demote admins.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5">
          <h3 className="text-xs font-semibold text-slate-200">
            Members · {members.length}
          </h3>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {members.map((member) => {
              const memberId = member.user_id ?? member.user?.id;
              if (!memberId) return null;
              const isCreator = memberId === creatorId;
              const isModerator = member.channel_role === "channel_moderator";
              const memberName = member.user?.name ?? memberId;

              return (
                <div
                  key={memberId}
                  className="flex items-center gap-2 rounded-xl px-2 py-2"
                >
                  {member.user?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.user.image}
                      alt=""
                      className="size-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-xs font-semibold text-emerald-200">
                      {memberName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">
                      {memberName}
                      {memberId === currentUserId ? " (you)" : ""}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isCreator
                        ? "Creator · Admin"
                        : isModerator
                          ? "Admin"
                          : "Member"}
                    </p>
                  </div>
                  {!isCreator && (
                    <div className="flex shrink-0 items-center gap-1">
                      {canManageRoles && (
                        <button
                          type="button"
                          disabled={busyUserId === memberId}
                          onClick={() =>
                            void updateMember(
                              isModerator ? "demote" : "promote",
                              memberId,
                            )
                          }
                          className="rounded-lg px-2 py-1.5 text-[11px] text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
                        >
                          {isModerator ? "Remove admin" : "Make admin"}
                        </button>
                      )}
                      {memberId !== currentUserId && (
                        <button
                          type="button"
                          disabled={busyUserId === memberId}
                          onClick={() => void updateMember("remove", memberId)}
                          className="rounded-lg px-2 py-1.5 text-[11px] text-rose-300 hover:bg-rose-400/10 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 border-t border-white/[0.07] pt-4">
          <h3 className="text-xs font-semibold text-slate-200">Add people</h3>
          <input
            value={query}
            onChange={(event) => {
              setUsers([]);
              setSearching(false);
              setError("");
              setQuery(event.target.value);
            }}
            placeholder="Search by name or username"
            aria-label="Search people to add"
            className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
          />
          <div className="mt-2 max-h-40 overflow-y-auto">
            {!peopleSearchTerm(query) && (
              <p className="px-2 py-3 text-center text-xs text-slate-500">
                Enter at least 2 characters to search.
              </p>
            )}
            {searching && (
              <p className="px-2 py-3 text-center text-xs text-slate-500">
                Searching…
              </p>
            )}
            {!searching &&
              users
                .filter(
                  (user) =>
                    !members.some(
                      (member) =>
                        (member.user_id ?? member.user?.id) === user.id,
                    ),
                )
                .map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2"
                  >
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.image}
                        alt=""
                        className="size-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-xs font-semibold text-emerald-200">
                        {(user.name ?? user.id).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                      {user.name ?? user.id}
                    </span>
                    <button
                      type="button"
                      disabled={busyUserId === user.id}
                      onClick={() => void updateMember("add", user.id)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                ))}
            {!searching &&
              users.length > 0 &&
              users.every((user) =>
                members.some(
                  (member) => (member.user_id ?? member.user?.id) === user.id,
                ),
              ) && (
                <p className="px-2 py-3 text-center text-xs text-slate-500">
                  Everyone found is already in this group.
                </p>
              )}
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-xs leading-5 text-rose-300">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function IncomingCallPrompt({
  onJoin,
  onDecline,
  recoveredCall,
  autoAcceptCallCid,
}: {
  onJoin: (call: Call, cameraWarning?: string) => void;
  onDecline: (
    call: Call,
    participants: PendingIncomingCall["participants"],
  ) => void;
  recoveredCall: Call | null;
  autoAcceptCallCid: string | null;
}) {
  const calls = useCalls();
  const incomingCall =
    recoveredCall ??
    calls.find(
      (call) =>
        call.state.callingState === CallingState.RINGING && !call.isCreatedByMe,
    ) ??
    null;
  const notifiedCallCid = useRef<string | null>(null);
  const notifyingCallCid = useRef<string | null>(null);
  const incomingCallCid = incomingCall?.cid;
  const callerName = incomingCall?.state.createdBy?.name ?? "A teammate";

  useEffect(() => {
    if (!incomingCallCid) return;
    return startCallRingtone();
  }, [incomingCallCid]);

  useEffect(() => {
    if (!incomingCallCid) {
      notifiedCallCid.current = null;
      notifyingCallCid.current = null;
      return;
    }

    if (
      notifiedCallCid.current === incomingCallCid ||
      notifyingCallCid.current === incomingCallCid
    ) {
      return;
    }

    notifyingCallCid.current = incomingCallCid;
    void showIncomingCallNotification(callerName, incomingCallCid)
      .then((shown) => {
        if (shown) notifiedCallCid.current = incomingCallCid;
        notifyingCallCid.current = null;
      })
      .catch((error: unknown) => {
        notifyingCallCid.current = null;
        console.error("Unable to show incoming call notification", error);
      });
  }, [callerName, incomingCallCid]);

  if (!incomingCall) return null;

  return (
    <IncomingCallDialog
      key={incomingCall.cid}
      call={incomingCall}
      onJoin={onJoin}
      onDecline={onDecline}
      autoAccept={incomingCall.cid === autoAcceptCallCid}
    />
  );
}

function IncomingCallDialog({
  call,
  onJoin,
  onDecline,
  autoAccept,
}: {
  call: Call;
  autoAccept: boolean;
  onJoin: (call: Call, cameraWarning?: string) => void;
  onDecline: (
    call: Call,
    participants: PendingIncomingCall["participants"],
  ) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const autoAcceptStarted = useRef(false);
  const callerName = call.state.createdBy?.name ?? "A teammate";

  const acceptCall = useCallback(async () => {
    stopCallRingtone();
    setBusy(true);
    setError("");
    try {
      const cameraWarning = await joinIncomingCall(call);
      onJoin(call, cameraWarning);
    } catch (cause) {
      console.error("Unable to join incoming call", cause);
      setError("Could not join this call. Please try again.");
      startCallRingtone();
      setBusy(false);
    }
  }, [call, onJoin]);

  useEffect(() => {
    if (!autoAccept || autoAcceptStarted.current) return;
    autoAcceptStarted.current = true;
    void acceptCall();
  }, [acceptCall, autoAccept]);

  async function declineCall() {
    stopCallRingtone();
    setBusy(true);
    setError("");
    const participants: PendingIncomingCall["participants"] =
      call.state.participants
      .filter((participant) => !participant.isLocalParticipant)
      .map((participant) => ({
        id: participant.userId,
        name: participant.name ?? "Teammate",
        image: participant.image,
      }));
    if (participants.length === 0 && call.state.createdBy) {
      participants.push({
        id: call.state.createdBy.id,
        name: call.state.createdBy.name ?? "Teammate",
        image: call.state.createdBy.image,
      });
    }

    try {
      await call.leave({ reject: true, reason: "decline" });
      onDecline(call, participants);
    } catch (cause) {
      console.error("Unable to decline incoming call", cause);
      setError("Could not decline this call.");
      startCallRingtone();
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:pointer-events-none sm:inset-auto sm:bottom-5 sm:right-5 sm:block sm:w-[min(360px,calc(100vw-2.5rem))] sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="incoming-call-title"
        className="pointer-events-auto w-full max-w-sm animate-fade-in rounded-3xl border border-white/10 bg-[#151620]/95 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:max-w-none sm:rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-200 ring-4 ring-emerald-400/[0.06]">
            <Phone size={19} className="animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-500">
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
        <div className="mt-4 flex gap-2">
          <button
            disabled={busy}
            onClick={() => void declineCall()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white/[0.06] px-3 py-3 text-xs font-medium text-slate-300 transition hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-50 sm:flex-none sm:py-2"
          >
            <PhoneOff size={15} />
            Decline
          </button>
          <button
            disabled={busy}
            onClick={() => void acceptCall()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-3 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50 sm:flex-none sm:py-2"
          >
            <Phone size={15} />
            {busy ? "Joining…" : "Join call"}
          </button>
        </div>
      </section>
    </div>
  );
}

function DeclinedCallBanner({
  pendingCall,
  videoClient,
  onJoin,
  onExpire,
}: {
  pendingCall: PendingIncomingCall;
  videoClient: StreamVideoClient;
  onJoin: (call: Call, cameraWarning?: string) => void;
  onExpire: () => void;
}) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.ceil((pendingCall.expiresAt - Date.now()) / 1000)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const updateRemaining = () => {
      const remaining = Math.max(
        0,
        Math.ceil((pendingCall.expiresAt - Date.now()) / 1000),
      );
      setRemainingSeconds(remaining);
      if (remaining === 0) onExpire();
    };
    const interval = window.setInterval(updateRemaining, 1000);
    updateRemaining();
    return () => window.clearInterval(interval);
  }, [onExpire, pendingCall.expiresAt]);

  async function rejoinCall() {
    setBusy(true);
    setError("");
    try {
      const call = videoClient.call(
        pendingCall.call.type,
        pendingCall.call.id,
      );
      await call.get();
      await call.join();
      let cameraWarning = "";
      if (call.type !== "audio_call") {
        try {
          await call.camera.enable();
        } catch (cause) {
          console.error("Unable to enable camera when rejoining call", cause);
          cameraWarning =
            "You joined without video. Allow camera access, then turn on your camera.";
        }
      }
      onJoin(call, cameraWarning);
    } catch (cause) {
      console.error("Unable to rejoin declined call", cause);
      setError("This call is no longer active. Try joining from a new invite.");
      setBusy(false);
    }
  }

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[60] w-[min(520px,calc(100vw-2rem))] -translate-x-1/2">
      <section
        role="status"
        aria-label="Call still active"
        className="pointer-events-auto rounded-2xl border border-emerald-300/20 bg-[#151620]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {pendingCall.participants.slice(0, 4).map((participant) => (
              <div
                key={participant.id}
                aria-label={participant.name}
                title={participant.name}
                className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#151620] bg-slate-700 text-xs font-semibold text-white"
              >
                {participant.image ? (
                  <span
                    aria-hidden="true"
                    className="size-full bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${JSON.stringify(participant.image)})`,
                    }}
                  />
                ) : (
                  participant.name.slice(0, 1).toUpperCase()
                )}
              </div>
            ))}
            {pendingCall.participants.length === 0 && (
              <div className="grid size-9 place-items-center rounded-full bg-emerald-400/15 text-emerald-200">
                <Phone size={16} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">The call is still active</p>
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {pendingCall.participants.length > 0
                ? pendingCall.participants
                    .slice(0, 3)
                    .map((participant) => participant.name)
                    .join(", ")
                : "Join while people are still there"}
              {pendingCall.participants.length > 3 ? " and more" : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || remainingSeconds === 0}
            onClick={() => void rejoinCall()}
            className="shrink-0 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? "Joining…" : "Join call"}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>This invite closes in {minutes}:{seconds}</span>
          <button
            type="button"
            onClick={onExpire}
            className="text-slate-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-rose-300">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function CallOverlay({
  call,
  cameraWarning,
  theme,
  onClose,
}: {
  call: Call;
  cameraWarning: string;
  theme: ColorTheme;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-0 backdrop-blur-md sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden border border-white/10 bg-[#11121a] shadow-2xl sm:h-[min(760px,92vh)] sm:rounded-3xl">
        <StreamCall call={call}>
          <CallContent
            call={call}
            cameraWarning={cameraWarning}
            theme={theme}
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
  theme,
  onClose,
}: {
  call: Call;
  cameraWarning: string;
  theme: ColorTheme;
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

  useEffect(() => {
    let anotherParticipantJoined = call.state.remoteParticipants.length > 0;
    const subscription = call.state.remoteParticipants$.subscribe(
      (participants) => {
        if (participants.length > 0) anotherParticipantJoined = true;
      },
    );
    const timeout = window.setTimeout(() => {
      if (anotherParticipantJoined) return;
      void call
        .endCall()
        .then(() => call.leave())
        .catch((error: unknown) => {
          console.error("Unable to end unanswered call", error);
        });
    }, callJoinWindowMs);

    return () => {
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [call]);

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
        <CallStage call={call} />
      </div>
      <div className="flex shrink-0 justify-center border-t border-white/10 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:py-4">
        <CallControls
          theme={theme}
          onLeave={() => {
            void call.leave();
            onClose();
          }}
        />
      </div>
    </>
  );
}

function CallStage({ call }: { call: Call }) {
  const [participants, setParticipants] = useState<StreamVideoParticipant[]>(
    call.state.participants,
  );

  useEffect(() => {
    const subscription = call.state.participants$.subscribe(setParticipants);
    return () => subscription.unsubscribe();
  }, [call]);

  const screenSharers = participants.filter(
    hasScreenShare,
  );

  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden rounded-2xl bg-[#090a0f]">
      {screenSharers.length > 0 ? (
        <SpeakerLayout participantsBarPosition="bottom" pageArrowsVisible />
      ) : (
        <PaginatedGridLayout groupSize={4} pageArrowsVisible />
      )}
    </div>
  );
}

function CallControls({
  onLeave,
  theme,
}: {
  onLeave: () => void;
  theme: ColorTheme;
}) {
  const {
    useMicrophoneState,
    useCameraState,
    useScreenShareState,
  } = useCallStateHooks();
  const microphone = useMicrophoneState();
  const camera = useCameraState();
  const screenShare = useScreenShareState();
  const [filter, setFilter] = useState<CameraFilter>("none");
  const [faceEmoji, setFaceEmoji] = useState<FaceEmoji>("none");
  const [background, setBackground] = useState<CameraBackground>("none");
  const [openMenu, setOpenMenu] = useState<
    "filters" | "face" | "background" | null
  >(null);
  const [effectError, setEffectError] = useState("");
  const [screenShareError, setScreenShareError] = useState("");
  const [screenShareBusy, setScreenShareBusy] = useState(false);
  const [shareAudio, setShareAudio] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const isMobile = useSyncExternalStore(subscribeToMobileDevice, isMobileDevice, () => false);
  useEffect(() => {
    if (
      filter === "none" &&
      faceEmoji === "none" &&
      background === "none"
    ) {
      return;
    }

    const registration = camera.camera.registerFilter(
      createCameraEffectFilter(
        { filter, faceEmoji, background },
        (message) => setEffectError(message),
      ),
    );
    void registration.registered.catch((error: unknown) => {
      console.error("Unable to apply camera effect", error);
      setEffectError("This camera effect could not be applied to your camera.");
    });

    return () => {
      void registration.unregister().catch((error: unknown) => {
        console.error("Unable to remove camera effect", error);
      });
    };
  }, [background, camera.camera, faceEmoji, filter]);

  const menuSurface =
    theme === "dark"
      ? "border-white/10 bg-[#181a25] text-slate-100 shadow-black/50"
      : "border-slate-200 bg-white text-slate-800 shadow-slate-900/15";

  return (
    <div className="flex flex-col items-center gap-3" data-theme={theme}>
      <div className="flex flex-wrap items-end justify-center gap-3">
        <CameraEffectMenu
          label="Filters"
          icon={<SlidersHorizontal size={19} />}
          open={openMenu === "filters"}
          onToggle={() =>
            setOpenMenu(openMenu === "filters" ? null : "filters")
          }
          onSelect={(value) => {
            setFilter(value as CameraFilter);
            setEffectError("");
            setOpenMenu(null);
          }}
          selected={filter}
          defaultValue="none"
          options={[
            { value: "none", label: "Original" },
            { value: "mono", label: "Black & white", preview: "B&W" },
            { value: "pop", label: "Pop color", preview: "POP" },
            { value: "vintage", label: "Vintage", preview: "V" },
            { value: "warm", label: "Warm", preview: "W" },
            { value: "cool", label: "Cool", preview: "C" },
          ]}
          menuSurface={menuSurface}
        />
        <CameraEffectMenu
          label="Face"
          icon={<Smile size={19} />}
          open={openMenu === "face"}
          onToggle={() => setOpenMenu(openMenu === "face" ? null : "face")}
          onSelect={(value) => {
            setFaceEmoji(value as FaceEmoji);
            setEffectError("");
            setOpenMenu(null);
          }}
          selected={faceEmoji}
          defaultValue="none"
          options={[
            { value: "none", label: "No emoji" },
            { value: "goofy", label: "Goofy", preview: "🤪" },
            { value: "crying", label: "Crying", preview: "😭" },
            { value: "scared", label: "scared", preview: "💦" },
          ]}
          menuSurface={menuSurface}
        />
        <CameraEffectMenu
          label="Background"
          icon={<ImageIcon size={19} />}
          open={openMenu === "background"}
          onToggle={() =>
            setOpenMenu(openMenu === "background" ? null : "background")
          }
          onSelect={(value) => {
            setBackground(value as CameraBackground);
            setEffectError("");
            setOpenMenu(null);
          }}
          selected={background}
          defaultValue="none"
          options={[
            { value: "none", label: "Original" },
            { value: "blur", label: "Blur background", preview: "◌" },
            { value: "mint", label: "Mint studio", preview: "M" },
            { value: "sunset", label: "Sunset studio", preview: "S" },
            { value: "ocean", label: "Ocean studio", preview: "O" },
          ]}
          menuSurface={menuSurface}
        />
      </div>
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
        {isMobile && camera.isEnabled && (
          <ControlButton
            label="Switch camera"
            onClick={() => {
              setCameraError("");
              void camera.camera.flip().catch((error: unknown) => {
                console.error("Unable to switch camera", error);
                setCameraError("Could not switch cameras on this device.");
              });
            }}
            active
          >
            <Camera size={18} />
          </ControlButton>
        )}
        <ControlButton
          label={screenShare.isEnabled ? "Stop sharing" : "Share screen"}
          disabled={screenShareBusy}
          onClick={() => {
            setScreenShareError("");
            if (screenShareBusy) return;
            if (!screenShare.isEnabled && !navigator.mediaDevices?.getDisplayMedia) {
              setScreenShareError("Screen sharing is not supported in this browser or app. Try a supported desktop browser.");
              return;
            }
            if (!screenShare.isEnabled && shareAudio) {
              screenShare.screenShare.enableScreenShareAudio();
            }
            setScreenShareBusy(true);
            void screenShare.screenShare.toggle()
              .catch((error: unknown) => {
                console.error("Unable to share screen", error);
                setScreenShareError(error instanceof Error && error.name === "NotAllowedError"
                  ? "Screen sharing was cancelled or permission was denied."
                  : "Screen sharing failed. Check browser and call permissions, then try again.");
              })
              .finally(() => setScreenShareBusy(false));
          }}
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
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={shareAudio}
          disabled={screenShare.isEnabled || screenShareBusy}
          onChange={(event) => {
            const enabled = event.target.checked;
            setShareAudio(enabled);
            if (!enabled) {
              void screenShare.screenShare.disableScreenShareAudio().catch((error: unknown) => {
                console.error("Unable to disable screen share audio", error);
                setScreenShareError("Could not change screen share audio. Please try again.");
              });
            }
          }}
        />
        Share screen audio when supported
      </label>
      {(effectError || screenShareError || cameraError) && (
        <p role="alert" className="max-w-sm text-center text-xs text-rose-300">
          {effectError || screenShareError || cameraError}
        </p>
      )}
      <p className="max-w-md text-center text-[10px] leading-4 text-slate-500">
        Face and background effects are processed on your device.
      </p>
    </div>
  );
}

function CameraEffectMenu<T extends string>({
  label,
  icon,
  open,
  onToggle,
  onSelect,
  selected,
  defaultValue,
  options,
  menuSurface,
}: {
  label: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  onSelect: (value: T) => void;
  selected: T;
  defaultValue: T;
  options: Array<{ value: T; label: string; preview?: string }>;
  menuSurface: string;
}) {
  return (
    <div className="relative flex flex-col items-center gap-1">
      {open && (
        <div
          role="group"
          aria-label={`${label} options`}
          className={`absolute bottom-full left-1/2 z-20 mb-3 w-56 -translate-x-1/2 rounded-2xl border p-2 shadow-xl backdrop-blur-xl ${menuSurface}`}
        >
          <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">
            {label}
          </p>
          <div className="grid gap-1">
            {options.map((option) => (
              <button
                type="button"
                key={option.value}
                aria-pressed={selected === option.value}
                onClick={() => onSelect(option.value)}
                className={`flex min-h-10 items-center gap-3 rounded-xl px-2.5 text-left text-xs transition ${
                  selected === option.value
                    ? "bg-emerald-500/15 font-semibold text-emerald-600 dark:text-emerald-300"
                    : "hover:bg-slate-500/10"
                }`}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-500/10 text-sm">
                  {option.preview ?? (option.value === defaultValue ? "✓" : "•")}
                </span>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        aria-label={`${label} menu`}
        aria-expanded={open}
        title={`${label}${selected !== defaultValue ? `: ${selected}` : ""}`}
        onClick={onToggle}
        className={`grid size-11 place-items-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 ${
          open
            ? "border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
            : selected !== defaultValue
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/10"
        }`}
      >
        {icon}
      </button>
      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </div>
  );
}

function ControlButton({
  children,
  label,
  active,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-11 place-items-center rounded-full transition disabled:opacity-50 ${
        active
          ? "bg-white/10 text-white hover:bg-white/15"
          : "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
      }`}
    >
      {children}
    </button>
  );
}
