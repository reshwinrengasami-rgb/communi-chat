"use client";

import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Palette, X } from "lucide-react";
import { contrastTextColor, defaultAppearance, isAppearance, type Appearance } from "@/lib/appearance";

type AppearanceContextValue = {
  appearance: Appearance;
  sync: boolean;
  ready: boolean;
  error: string;
  save: (appearance: Appearance, sync: boolean) => Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function storageKey(userId: string) {
  return `communichat:appearance:${userId}`;
}

export function AppearanceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance);
  const [sync, setSync] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const stored = window.localStorage.getItem(storageKey(userId));
        const local: unknown = stored ? JSON.parse(stored) : null;
        const record = local && typeof local === "object" ? local as Record<string, unknown> : null;
        let next = isAppearance(record?.appearance) ? record.appearance : defaultAppearance;
        const synced = record?.sync === true;
        if (synced) {
          try {
            const response = await fetch("/api/appearance", { cache: "no-store" });
            if (!response.ok) throw new Error("Could not load synced appearance.");
            const data: unknown = await response.json();
            if (data && typeof data === "object" && "appearance" in data && isAppearance(data.appearance)) {
              next = data.appearance;
            }
          } catch (cause) {
            console.error("Unable to load synced appearance", cause);
            if (active) setError("Could not load synced appearance. Showing this device's last saved settings.");
          }
        }
        if (active) {
          setAppearance(next);
          setSync(synced);
          setReady(true);
        }
      } catch (cause) {
        console.error("Unable to read appearance settings", cause);
        if (active) {
          setError("Could not read settings on this device.");
          setReady(true);
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [userId]);

  async function save(next: Appearance, nextSync: boolean) {
    if (!isAppearance(next)) throw new Error("Invalid appearance settings.");
    if (nextSync && !sync) {
      const response = await fetch("/api/appearance", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load synced appearance. Please try again.");
      const data: unknown = await response.json();
      if (data && typeof data === "object" && "appearance" in data && isAppearance(data.appearance)) {
        next = data.appearance;
      }
    }
    if (nextSync) {
      const response = await fetch("/api/appearance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Could not save synced appearance. Please try again.");
    }
    try {
      window.localStorage.setItem(storageKey(userId), JSON.stringify({ appearance: next, sync: nextSync }));
    } catch (cause) {
      console.error("Unable to save appearance on this device", cause);
      throw new Error("Could not save on this device. Check available storage.");
    }
    setAppearance(next);
    setSync(nextSync);
    setError("");
  }

  const style = {
    "--communichat-bubble": appearance.bubbleColor,
    "--communichat-bubble-text": contrastTextColor(appearance.bubbleColor),
    "--communichat-background": appearance.backgroundColor,
    "--communichat-photo": appearance.backgroundPhoto ? `url("${appearance.backgroundPhoto}")` : "none",
    "--communichat-header-button": { small: "36px", normal: "40px", large: "48px" }[appearance.buttonSize],
  } as CSSProperties;

  return (
    <AppearanceContext.Provider value={{ appearance, sync, ready, error, save }}>
      <div className="communichat-appearance flex h-full min-h-0 flex-col" style={style}>
        {children}
      </div>
    </AppearanceContext.Provider>
  );
}

export function AppearanceSettings() {
  const context = useContext(AppearanceContext);
  const [open, setOpen] = useState(false);
  if (!context) throw new Error("Appearance settings require an appearance provider.");
  return (
    <>
      <button type="button" aria-label="Appearance settings" title="Appearance settings"
        onClick={() => setOpen(true)}
        className="grid size-10 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white">
        <Palette size={22} />
      </button>
      {open && <AppearanceDialog context={context} onClose={() => setOpen(false)} />}
    </>
  );
}

function AppearanceDialog({ context, onClose }: { context: AppearanceContextValue; onClose: () => void }) {
  const [draft, setDraft] = useState(context.appearance);
  const [sync, setSync] = useState(context.sync);
  const [error, setError] = useState(context.error);
  const [saving, setSaving] = useState(false);

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 290000) {
      setError("Choose a PNG, JPEG, or WebP photo smaller than 290 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDraft((current) => ({ ...current, backgroundPhoto: reader.result as string }));
        setError("");
      }
    };
    reader.onerror = () => setError("Could not read that photo.");
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await context.save(draft, sync);
      onClose();
    } catch (cause) {
      console.error("Unable to save appearance", cause);
      setError(cause instanceof Error ? cause.message : "Could not save appearance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="appearance-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#151620] p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 id="appearance-title" className="font-semibold">Appearance settings</h2>
          <button type="button" aria-label="Close" onClick={onClose} disabled={saving}><X size={20} /></button>
        </div>
        <label className="mt-5 block text-sm">Top button size
          <select value={draft.buttonSize} onChange={(event) => {
            const value = event.target.value;
            if (value === "small" || value === "normal" || value === "large") {
              setDraft((current) => ({ ...current, buttonSize: value }));
            }
          }} className="mt-2 block w-full rounded-lg bg-slate-800 p-2 text-white">
            <option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option>
          </select>
        </label>
        <label className="mt-4 flex items-center justify-between text-sm">My chat bubble color
          <input type="color" value={draft.bubbleColor} onChange={(event) => setDraft({ ...draft, bubbleColor: event.target.value })} />
        </label>
        <label className="mt-4 flex items-center justify-between text-sm">Chat background color
          <input type="color" value={draft.backgroundColor} onChange={(event) => setDraft({ ...draft, backgroundColor: event.target.value })} />
        </label>
        <label className="mt-4 block text-sm">Chat background photo
          <input type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-xs"
            onChange={(event) => choosePhoto(event.target.files?.[0])} />
        </label>
        {draft.backgroundPhoto && <button type="button" className="mt-2 text-xs text-emerald-300 underline"
          onClick={() => setDraft({ ...draft, backgroundPhoto: "" })}>Remove photo</button>}
        <label className="mt-5 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={sync} onChange={(event) => setSync(event.target.checked)} />
          <span>Sync appearance to my account <span className="block text-xs text-slate-400">Off by default. Existing synced settings replace this device&apos;s settings when enabled. Your photo is stored with your account.</span></span>
        </label>
        {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
        <button type="button" disabled={saving || !context.ready} onClick={() => void save()}
          className="mt-5 w-full rounded-lg bg-emerald-600 p-2 text-sm text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </section>
    </div>
  );
}
