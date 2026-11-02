"use client";

import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

let callAudioContext: AudioContext | null = null;
let callSoundEnabled = false;

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
  const audioContext = callAudioContext;
  if (
    !callSoundEnabled ||
    !audioContext ||
    audioContext.state !== "running"
  ) {
    return;
  }

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

export function CallSoundToggle() {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");

  async function toggleSound() {
    setError("");
    if (enabled) {
      callSoundEnabled = false;
      setEnabled(false);
      return;
    }

    if (!(await prepareCallAudio())) {
      setError("Could not enable call sound in this browser.");
      return;
    }

    callSoundEnabled = true;
    setEnabled(true);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={enabled ? "Mute incoming call sound" : "Enable incoming call sound"}
        aria-pressed={enabled}
        title={enabled ? "Mute incoming call sound" : "Enable incoming call sound"}
        onClick={() => void toggleSound()}
        className={`grid size-9 place-items-center rounded-lg transition ${
          enabled
            ? "bg-violet-400/10 text-violet-200 hover:bg-violet-400/20"
            : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
        }`}
      >
        {enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
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
