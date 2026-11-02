"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, LoaderCircle } from "lucide-react";

type PushConfig = {
  publicKey: string;
};

let callAudioContext: AudioContext | null = null;

async function prepareCallAudio() {
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

export function playCallChime() {
  if (!callAudioContext || callAudioContext.state !== "running") return;

  const startAt = callAudioContext.currentTime;
  [880, 660].forEach((frequency, index) => {
    const start = startAt + index * 0.24;
    const oscillator = callAudioContext!.createOscillator();
    const volume = callAudioContext!.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
    oscillator.connect(volume);
    volume.connect(callAudioContext!.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.21);
  });
}

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function getPushConfig() {
  const response = await fetch("/api/push-subscriptions");
  const result = (await response.json()) as PushConfig | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in result ? result.error : "Could not load push notifications",
    );
  }
  return result as PushConfig;
}

export function CallNotificationToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getPushConfig()
      .then(async () => {
        const registration = await navigator.serviceWorker
          .getRegistration()
          .catch(() => undefined);
        const subscription = await registration?.pushManager.getSubscription();
        if (active) setEnabled(Boolean(subscription));
      })
      .catch((loadError: unknown) => {
        console.error("Unable to load push notification settings", loadError);
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load push notifications",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggleNotifications() {
    setLoading(true);
    setError("");

    try {
      if (enabled) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const response = await fetch("/api/push-subscriptions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          if (!response.ok) {
            throw new Error("Could not disable push notifications");
          }
          await subscription.unsubscribe();
        }
        setEnabled(false);
        return;
      }

      const audioReady = await prepareCallAudio();
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("This browser does not support background notifications");
      }
      if (!("Notification" in window)) {
        throw new Error("This browser does not support notifications");
      }
      if (Notification.permission === "denied") {
        throw new Error(
          "Notifications are blocked. Allow them in your browser settings first.",
        );
      }

      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Allow notifications to receive chat and call alerts");
      }

      const config = await getPushConfig();
      const registration = await navigator.serviceWorker.register("/sw.js");
      const pushManager = registration.pushManager;
      const subscription =
        (await pushManager.getSubscription()) ??
        (await pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(config.publicKey),
        }));
      const response = await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? "Could not enable call notifications");
      }

      setEnabled(true);
      if (!audioReady) {
        setError(
          "Notifications are enabled. Your browser may require another interaction before the in-page chime can play.",
        );
      }
    } catch (toggleError) {
      console.error("Unable to update call notification settings", toggleError);
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Could not update call notifications",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={
          enabled
            ? "Disable chat and call notifications"
            : "Enable chat and call notifications"
        }
        aria-pressed={enabled}
        title={
          enabled
            ? "Disable background chat and call notifications"
            : "Enable background chat and call notifications"
        }
        disabled={loading}
        onClick={() => void toggleNotifications()}
        className={`grid size-9 place-items-center rounded-lg transition disabled:opacity-50 ${
          enabled
            ? "bg-violet-400/10 text-violet-200 hover:bg-violet-400/20"
            : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
        }`}
      >
        {loading ? (
          <LoaderCircle size={17} className="animate-spin" />
        ) : enabled ? (
          <Bell size={17} />
        ) : (
          <BellOff size={17} />
        )}
      </button>
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
