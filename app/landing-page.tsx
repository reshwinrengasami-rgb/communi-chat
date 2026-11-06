import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Check,
  MessageCircle,
  Mic2,
  Video,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: MessageCircle,
    title: "Conversations that stay together",
    description:
      "Keep messages, decisions, and the people behind them in one calm workspace.",
  },
  {
    icon: Video,
    title: "A call is one tap away",
    description:
      "Start an audio or video call right from a conversation. Join while it is still live.",
  },
  {
    icon: BellRing,
    title: "Know when someone rings",
    description:
      "Get an in-app call prompt and optional browser notifications when Communichat is open.",
  },
];

export function LandingPage() {
  return (
    <main className="landing-page min-h-screen overflow-hidden">
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
        <Link href="/" className="flex items-center gap-3" aria-label="CommuniChat home">
          <span className="grid size-10 place-items-center rounded-2xl bg-emerald-400 text-[#07120e] shadow-[0_8px_30px_rgba(52,211,153,0.22)]">
            <MessageCircle size={20} strokeWidth={2.5} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-white">
            CommuniChat
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3" aria-label="Main navigation">
          <Link
            href="/sign-in"
            className="rounded-full px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-100 sm:px-5"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="landing-grid relative mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 sm:pb-28 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-20">
        <div className="relative z-10">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3.5 py-2 text-xs font-medium text-emerald-200">
            <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.85)]" />
            Your people, one good conversation away
          </div>
          <h1 className="max-w-3xl text-[clamp(3.2rem,7.5vw,6.6rem)] font-semibold leading-[0.98] tracking-[-0.075em] text-white">
            Make room for
            <span className="landing-gradient block">better conversations.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
            A quieter place to message your team, share the little things, and
            jump into a call when words deserve a face.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-emerald-300 px-6 text-sm font-semibold text-[#07120e] shadow-[0_10px_35px_rgba(52,211,153,0.16)] transition hover:-translate-y-0.5 hover:bg-emerald-200"
            >
              Start a conversation <ArrowRight size={16} />
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.025] px-6 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              I already have an account
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} className="text-emerald-300" /> Messages and calls
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} className="text-emerald-300" /> Works on mobile
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} className="text-emerald-300" /> Join a live call
            </span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[540px] lg:ml-auto">
          <div className="landing-orb pointer-events-none absolute -inset-8 rounded-full blur-3xl" />
          <div className="landing-preview relative rounded-[28px] border border-white/[0.09] bg-[#11141b]/90 p-3 shadow-[0_35px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:rounded-[34px] sm:p-4">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-2 pb-4 pt-1 sm:px-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-xl bg-emerald-300 text-[#07120e]">
                  <MessageCircle size={16} />
                </span>
                <span className="text-sm font-semibold text-slate-100">Your workspace</span>
              </div>
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="size-2 rounded-full bg-white/10" />
                <span className="size-2 rounded-full bg-white/10" />
                <span className="size-2 rounded-full bg-white/10" />
              </div>
            </div>

            <div className="grid min-h-[330px] grid-cols-[116px_1fr] sm:min-h-[380px] sm:grid-cols-[150px_1fr]">
              <aside className="border-r border-white/[0.07] px-2 py-4 sm:px-3">
                <p className="mb-3 px-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  Conversations
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 rounded-xl bg-white/[0.07] px-2 py-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-violet-400/20 text-[10px] font-semibold text-violet-200">
                      D
                    </span>
                    <span className="truncate text-[10px] font-medium text-white sm:text-xs">
                      Design team
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl px-2 py-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-sky-400/15 text-[10px] font-semibold text-sky-200">
                      P
                    </span>
                    <span className="truncate text-[10px] text-slate-400 sm:text-xs">
                      Product
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl px-2 py-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-400/15 text-[10px] font-semibold text-amber-200">
                      M
                    </span>
                    <span className="truncate text-[10px] text-slate-400 sm:text-xs">
                      Maya
                    </span>
                  </div>
                </div>
              </aside>

              <div className="flex min-w-0 flex-col px-3 py-4 sm:px-5">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <div>
                    <p className="text-xs font-semibold text-white sm:text-sm">Design team</p>
                    <p className="mt-1 text-[9px] text-slate-500 sm:text-[10px]">
                      <span className="mr-1 inline-block size-1.5 rounded-full bg-emerald-300" />
                      3 people here
                    </p>
                  </div>
                  <div className="flex size-8 items-center justify-center rounded-lg border border-white/[0.08] text-emerald-200">
                    <Video size={15} />
                  </div>
                </div>
                <div className="flex flex-1 flex-col justify-end gap-3 py-5">
                  <div className="flex items-end gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-violet-400/20 text-[9px] font-semibold text-violet-200">
                      M
                    </span>
                    <div className="rounded-2xl rounded-bl-md bg-white/[0.06] px-3 py-2.5">
                      <p className="text-[10px] leading-5 text-slate-200 sm:text-xs">
                        The new direction feels so much clearer ✨
                      </p>
                    </div>
                  </div>
                  <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-emerald-300 px-3 py-2.5">
                    <p className="text-[10px] leading-5 text-[#10231b] sm:text-xs">
                      Agreed! Let’s talk it through?
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sky-400/20 text-[9px] font-semibold text-sky-200">
                      J
                    </span>
                    <div className="rounded-2xl rounded-bl-md bg-white/[0.06] px-3 py-2.5">
                      <p className="text-[10px] leading-5 text-slate-200 sm:text-xs">
                        I’m starting a quick call now
                      </p>
                    </div>
                  </div>
                  <div className="landing-call-card mt-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-3 sm:p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-300 text-[#07120e]">
                        <Video size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold text-white sm:text-xs">
                          Jordan started a call
                        </p>
                        <p className="mt-1 text-[9px] text-slate-400 sm:text-[10px]">
                          Join while it’s live
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-300 px-3 py-2 text-[9px] font-bold text-[#07120e] sm:text-[10px]">
                        Join
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3">
                  <span className="text-xs text-slate-600">Message your team…</span>
                  <span className="ml-auto grid size-6 place-items-center rounded-lg bg-emerald-300 text-[#07120e]">
                    <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            </div>
            <div className="landing-notification absolute -bottom-5 left-2 right-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1a1d26]/95 p-3 shadow-2xl backdrop-blur-xl sm:-bottom-7 sm:-left-8 sm:right-8 sm:p-4">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-300/15 text-emerald-200">
                <BellRing size={18} />
                <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-[#1a1d26] bg-emerald-300" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold text-slate-100 sm:text-xs">
                  Incoming call · Design team
                </p>
                <p className="mt-1 truncate text-[9px] text-slate-400 sm:text-[10px]">
                  Open Communichat to answer or join
                </p>
              </div>
              <span className="grid size-8 place-items-center rounded-full bg-emerald-300 text-[#07120e]">
                <Mic2 size={15} />
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-white/[0.015]">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 sm:py-16 md:grid-cols-3 md:gap-10">
          {features.map(({ icon: Icon, title, description }, index) => (
            <article key={title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-300/10 bg-emerald-300/[0.06] text-emerald-200">
                <Icon size={18} />
              </span>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70">
                  0{index + 1}
                </p>
                <h2 className="text-sm font-semibold text-white">{title}</h2>
                <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                  {description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-7 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>© {new Date().getFullYear()} CommuniChat</span>
        <span className="inline-flex items-center gap-1.5">
          Made for the conversations that matter <Zap size={12} className="text-emerald-300" />
        </span>
      </footer>
    </main>
  );
}
