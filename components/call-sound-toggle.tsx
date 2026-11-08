"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Bell,
  BellRing,
  BellOff,
  Music2,
  RotateCcw,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";

let callAudioContext: AudioContext | null = null;
let callSoundEnabled = true;
let customCallSound: string | null = null;
let customCallSoundName: string | null = null;
let callSoundRevision = 0;
let activeCallAudio: HTMLAudioElement | null = null;
let callRingtoneInterval: number | null = null;
const callSoundChangeEvent = "communichat:call-sound-change";
const callSoundEnabledStorageKey = "communichat:call-sound-enabled";
const customCallSoundStorageKey = "communichat:custom-call-sound";
const customCallSoundNameStorageKey = "communichat:custom-call-sound-name";
const maximumCallSoundSize = 50 * 1024;
const callNotificationsStorageKey = "communichat:call-notifications-enabled";
const callNotificationsChangeEvent = "communichat:call-notifications-change";

function subscribeToCallSound(onChange: () => void) {
  const handleStorage = () => {
    loadCallSoundPreferences();
    onChange();
  };
  window.addEventListener(callSoundChangeEvent, onChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(callSoundChangeEvent, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function getCallSoundSnapshot() {
  return callSoundRevision;
}

function notifyCallSoundChanged() {
  callSoundRevision += 1;
  window.dispatchEvent(new Event(callSoundChangeEvent));
}

function loadCallSoundPreferences() {
  callSoundEnabled =
    window.localStorage.getItem(callSoundEnabledStorageKey) !== "disabled";
  customCallSound = window.localStorage.getItem(customCallSoundStorageKey);
  customCallSoundName = window.localStorage.getItem(customCallSoundNameStorageKey);
  notifyCallSoundChanged();
}

function setCallSoundEnabled(enabled: boolean) {
  window.localStorage.setItem(
    callSoundEnabledStorageKey,
    enabled ? "enabled" : "disabled",
  );
  callSoundEnabled = enabled;
  notifyCallSoundChanged();
}

function setCustomCallSound(dataUrl: string | null, fileName: string | null) {
  if (dataUrl && fileName) {
    window.localStorage.setItem(customCallSoundStorageKey, dataUrl);
    window.localStorage.setItem(customCallSoundNameStorageKey, fileName);
  } else {
    window.localStorage.removeItem(customCallSoundStorageKey);
    window.localStorage.removeItem(customCallSoundNameStorageKey);
  }
  customCallSound = dataUrl;
  customCallSoundName = fileName;
  notifyCallSoundChanged();
}

function subscribeToCallNotifications(onChange: () => void) {
  window.addEventListener(callNotificationsChangeEvent, onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener(callNotificationsChangeEvent, onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener("visibilitychange", onChange);
  };
}

function getCallNotificationsSnapshot() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted" &&
    window.localStorage.getItem(callNotificationsStorageKey) === "enabled"
  );
}

function notifyCallNotificationPreferenceChanged() {
  window.dispatchEvent(new Event(callNotificationsChangeEvent));
}

function decodeVapidPublicKey(value: string) {
  const encoded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const key = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    key[index] = binary.charCodeAt(index);
  }
  return key;
}

function matchesVapidPublicKey(
  subscription: PushSubscription,
  publicKey: string,
) {
  const applicationServerKey = subscription.options.applicationServerKey;
  if (!applicationServerKey) return false;
  const existingKey = new Uint8Array(applicationServerKey);
  const expectedKey = decodeVapidPublicKey(publicKey);
  return (
    existingKey.length === expectedKey.length &&
    existingKey.every((byte, index) => byte === expectedKey[index])
  );
}

async function responseError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export async function prepareCallAudio() {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return false;
  }

  try {
    callAudioContext ??= new window.AudioContext();
    if (callAudioContext.state === "suspended") {
      await callAudioContext.resume();
    }
    return callAudioContext.state === "running";
  } catch (error) {
    console.error("Unable to enable the incoming-call chime", error);
    return false;
  }
}

export async function playCallChime(force = false) {
  if (!force && !callSoundEnabled) return;

  if (customCallSound) {
    const audio = new Audio(customCallSound);
    audio.volume = 0.8;
    try {
      await audio.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Unable to play the selected incoming-call sound", error);
    }
    return;
  }

  if (!(await prepareCallAudio())) return;
  const audioContext = callAudioContext;
  if (!audioContext || audioContext.state !== "running") return;

  const startAt = audioContext.currentTime;
  [880, 660].forEach((frequency, index) => {
    const start = startAt + index * 0.24;
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
    oscillator.connect(volume);
    volume.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.21);
  });
}

export async function playMessageChime() {
  if (!(await prepareCallAudio())) return;
  const audioContext = callAudioContext;
  if (!audioContext || audioContext.state !== "running") return;

  const start = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const volume = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 1046;
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(0.07, start + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
  oscillator.connect(volume);
  volume.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.17);
}

export function startCallRingtone() {
  stopCallRingtone();
  if (!callSoundEnabled) return stopCallRingtone;

  if (customCallSound) {
    const audio = new Audio(customCallSound);
    audio.volume = 0.8;
    activeCallAudio = audio;
    audio.addEventListener(
      "ended",
      () => {
        if (activeCallAudio === audio) activeCallAudio = null;
      },
      { once: true },
    );
    void audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Unable to play the selected incoming-call sound", error);
    });
    return stopCallRingtone;
  }

  void playCallChime();
  callRingtoneInterval = window.setInterval(() => void playCallChime(), 1800);
  return stopCallRingtone;
}

export function stopCallRingtone() {
  if (callRingtoneInterval !== null) {
    window.clearInterval(callRingtoneInterval);
    callRingtoneInterval = null;
  }
  if (activeCallAudio) {
    activeCallAudio.pause();
    activeCallAudio.currentTime = 0;
    activeCallAudio = null;
  }
}

export async function showIncomingCallNotification(
  callerName: string,
  callCid: string,
): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    window.localStorage.getItem(callNotificationsStorageKey) !== "enabled"
  ) {
    return false;
  }

  const options: NotificationOptions = {
    body: `${callerName} invited you to join a call. Tap to open Communichat.`,
    tag: `communichat-call-${callCid}`,
    data: { callCid, type: "call" },
    requireInteraction: true,
    silent: false,
  };

  if ("serviceWorker" in navigator) {
    const registration =
      (await navigator.serviceWorker.getRegistration("/")) ??
      (await navigator.serviceWorker.register("/call-notifications-sw.js", {
        scope: "/",
      }));
    await navigator.serviceWorker.ready;
    await registration.showNotification("Incoming call", options);
    return true;
  }

  const notification = new Notification("Incoming call", options);
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  return true;
}

export function CallSoundToggle() {
  useSyncExternalStore(
    subscribeToCallSound,
    getCallSoundSnapshot,
    () => 0,
  );
  const enabled = callSoundEnabled;
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCallSoundPreferences();

    const unlock = () => {
      void prepareCallAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  async function toggleSound() {
    setError("");
    if (enabled) {
      try {
        setCallSoundEnabled(false);
      } catch (cause) {
        console.error("Unable to save call sound preference", cause);
        setError("Could not save your sound setting in this browser.");
      }
      return;
    }

    if (!customCallSound && !(await prepareCallAudio())) {
      setError("Tap or click the page once, then try enabling call sound again.");
      return;
    }

    try {
      setCallSoundEnabled(true);
    } catch (cause) {
      console.error("Unable to save call sound preference", cause);
      setError("Could not save your sound setting in this browser.");
    }
  }

  async function uploadSound(file?: File) {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setError("Choose an audio file.");
      return;
    }
    if (file.size > maximumCallSoundSize) {
      setError("Choose an audio file smaller than 50 KB.");
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            reject(new Error("The audio file could not be read."));
            return;
          }
          resolve(reader.result);
        };
        reader.onerror = () => reject(reader.error ?? new Error("The audio file could not be read."));
        reader.readAsDataURL(file);
      });
      setCustomCallSound(dataUrl, file.name);
      await prepareCallAudio();
      try {
        const preview = new Audio(dataUrl);
        preview.volume = 0.8;
        await preview.play();
      } catch (cause) {
        console.error("Unable to preview uploaded call sound", cause);
        setError("Sound saved. Preview playback was blocked by the browser.");
      }
    } catch (cause) {
      console.error("Unable to save uploaded call sound", cause);
      setError("Could not save that sound. Try a smaller audio file.");
    }
  }

  async function resetSound() {
    setError("");
    try {
      setCustomCallSound(null, null);
      await playCallChime(true);
    } catch (cause) {
      console.error("Unable to restore the default call sound", cause);
      setError("Could not restore the default call sound.");
    }
  }

  return (
    <div className="relative flex items-center gap-1">
      <button
        type="button"
        aria-label={enabled ? "Mute incoming call sound" : "Enable incoming call sound"}
        aria-pressed={enabled}
        title={enabled ? "Mute incoming call sound" : "Enable incoming call sound"}
        onClick={() => void toggleSound()}
        className={`grid size-9 place-items-center rounded-lg transition ${
          enabled
            ? "bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
            : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
        }`}
      >
        {enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
      </button>
      <button
        type="button"
        aria-label="Choose incoming call sound"
        aria-expanded={settingsOpen}
        onClick={() => {
          setSettingsOpen((open) => !open);
          setError("");
        }}
        className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
      >
        <Music2 size={15} />
      </button>
      {settingsOpen && (
        <div className="absolute right-0 top-full z-[70] mt-2 w-72 rounded-xl border border-white/10 bg-[#171821] p-3 text-slate-200 shadow-xl">
          <p className="text-xs font-semibold text-white">Incoming call sound</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-400">
            {customCallSoundName ?? "CommuniChat chime (default)"}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-white/[0.06] px-3 text-xs font-medium hover:bg-white/10"
            >
              <Upload size={14} /> Upload audio
            </button>
            <button
              type="button"
              onClick={() => void playCallChime(true)}
              className="min-h-9 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white hover:bg-emerald-400"
            >
              Preview
            </button>
          </div>
          {customCallSound && (
            <button
              type="button"
              onClick={() => void resetSound()}
              className="mt-2 inline-flex items-center gap-1.5 rounded px-1 py-1 text-[11px] text-slate-400 hover:text-white"
            >
              <RotateCcw size={12} /> Use default sound
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void uploadSound(file);
            }}
          />
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-white/10 bg-[#171821] p-3 text-xs leading-5 text-slate-200 shadow-xl"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function CallNotificationsToggle() {
  const enabled = useSyncExternalStore(
    subscribeToCallNotifications,
    getCallNotificationsSnapshot,
    () => false,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkExistingSubscription() {
      if (
        !("Notification" in window) ||
        Notification.permission !== "granted" ||
        window.localStorage.getItem(callNotificationsStorageKey) !== "enabled" ||
        !("serviceWorker" in navigator)
      ) {
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (active && !subscription) {
          window.localStorage.removeItem(callNotificationsStorageKey);
          notifyCallNotificationPreferenceChanged();
        }
      } catch (cause) {
        console.error("Unable to check browser push subscription", cause);
        if (active) {
          setError("Could not check this browser’s notification subscription.");
        }
      }
    }

    void checkExistingSubscription();
    return () => {
      active = false;
    };
  }, []);

  async function toggleNotifications() {
    setError("");
    if (enabled) {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const response = await fetch("/api/push-subscriptions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          if (!response.ok) {
            throw new Error(
              await responseError(response, "Could not remove push subscription."),
            );
          }
          const unsubscribed = await subscription.unsubscribe();
          if (!unsubscribed) {
            throw new Error("The browser could not unsubscribe this device.");
          }
        }
        window.localStorage.removeItem(callNotificationsStorageKey);
        notifyCallNotificationPreferenceChanged();
      } catch (cause) {
        console.error("Unable to disable browser call notifications", cause);
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not disable call notifications in this browser.",
        );
      }
      return;
    }
    if (!("Notification" in window)) {
      setError("Call notifications are not supported in this browser.");
      return;
    }

    try {
      const nextPermission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (nextPermission !== "granted") {
        notifyCallNotificationPreferenceChanged();
        setError(
          nextPermission === "denied"
            ? "Allow notifications for Communichat in your browser settings."
            : "Notification permission was not granted.",
        );
        return;
      }

      if (!("serviceWorker" in navigator)) {
        throw new Error("This browser cannot register notification handlers.");
      }
      await navigator.serviceWorker.register(
        "/call-notifications-sw.js",
        { scope: "/" },
      );
      const readyRegistration = await navigator.serviceWorker.ready;
      const publicKeyResponse = await fetch("/api/push-subscriptions");
      if (!publicKeyResponse.ok) {
        throw new Error(
          await responseError(
            publicKeyResponse,
            "The server could not provide its Web Push public key.",
          ),
        );
      }
      const publicKeyResult: unknown = await publicKeyResponse.json();
      if (
        typeof publicKeyResult !== "object" ||
        publicKeyResult === null ||
        !("publicKey" in publicKeyResult) ||
        typeof publicKeyResult.publicKey !== "string"
      ) {
        throw new Error("The server returned an invalid Web Push public key.");
      }

      let existingSubscription =
        await readyRegistration.pushManager.getSubscription();
      if (
        existingSubscription &&
        !matchesVapidPublicKey(existingSubscription, publicKeyResult.publicKey)
      ) {
        const removeResponse = await fetch("/api/push-subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existingSubscription.endpoint }),
        });
        if (!removeResponse.ok) {
          throw new Error(
            await responseError(
              removeResponse,
              "Could not replace the old browser notification subscription.",
            ),
          );
        }
        const unsubscribed = await existingSubscription.unsubscribe();
        if (!unsubscribed) {
          throw new Error("The browser could not replace its old notification subscription.");
        }
        existingSubscription = null;
      }
      const subscription =
        existingSubscription ??
        (await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidPublicKey(publicKeyResult.publicKey),
        }));
      const subscriptionData = subscription.toJSON();
      if (!subscriptionData.keys?.p256dh || !subscriptionData.keys.auth) {
        throw new Error("This browser returned an incomplete push subscription.");
      }
      const saveResponse = await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subscriptionData.keys,
        }),
      });
      if (!saveResponse.ok) {
        await subscription.unsubscribe();
        throw new Error(
          await responseError(saveResponse, "Could not save this browser subscription."),
        );
      }

      await readyRegistration.showNotification(
        "CommuniChat notifications are on",
        {
          body: "You’ll see a notification when someone calls while CommuniChat is in the background.",
          tag: "communichat-notifications-enabled",
        },
      );
      window.localStorage.setItem(callNotificationsStorageKey, "enabled");
      notifyCallNotificationPreferenceChanged();
    } catch (cause) {
      console.error("Unable to enable call notifications", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not enable call notifications in this browser.",
      );
    }
  }

  async function sendTestNotification() {
    setError("");
    setMessage("");
    setTesting(true);
    try {
      const response = await fetch("/api/push-subscriptions/test", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            "The server could not send a test notification.",
          ),
        );
      }
      setMessage("Test push sent. Check this device’s notification tray.");
    } catch (cause) {
      console.error("Unable to show a test call notification", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not show a notification on this device.",
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={
          enabled ? "Disable incoming call notifications" : "Enable incoming call notifications"
        }
        aria-pressed={enabled}
        title={
          enabled
            ? "Disable call notifications"
            : "Enable call notifications"
        }
        onClick={() => void toggleNotifications()}
        className={`grid size-9 place-items-center rounded-lg transition ${
          enabled
            ? "bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
            : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
        }`}
      >
        {enabled ? <Bell size={17} /> : <BellOff size={17} />}
      </button>
      {enabled && (
        <button
          type="button"
          aria-label="Send a push test notification"
          title="Send a push test notification"
          disabled={testing}
          onClick={() => void sendTestNotification()}
          className="grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
        >
          <BellRing size={16} />
        </button>
      )}
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-white/10 bg-[#171821] p-3 text-xs leading-5 text-slate-200 shadow-xl"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-emerald-400/20 bg-[#171821] p-3 text-xs leading-5 text-emerald-100 shadow-xl"
        >
          {message}
        </p>
      )}
    </div>
  );
}
