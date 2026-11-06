import Link from "next/link";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import {
  ArrowRight,
  BellRing,
  Check,
  MessageCircle,
  Video,
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
          <SignInButton mode="redirect" forceRedirectUrl="/">
            <button
              type="button"
              className="rounded-full px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:text-white"
            >
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="redirect" forceRedirectUrl="/">
            <button
              type="button"
              className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-100 sm:px-5"
            >
              Get started
            </button>
          </SignUpButton>
        </nav>
      </header>

      <section className="landing-grid relative mx-auto w-full max-w-7xl px-5 pb-20 pt-10 sm:px-8 sm:pb-28 sm:pt-16 lg:pt-20">
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
            <SignUpButton mode="redirect" forceRedirectUrl="/">
              <button
                type="button"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-emerald-300 px-6 text-sm font-semibold text-[#07120e] shadow-[0_10px_35px_rgba(52,211,153,0.16)] transition hover:-translate-y-0.5 hover:bg-emerald-200"
              >
                Start a conversation <ArrowRight size={16} />
              </button>
            </SignUpButton>
            <SignInButton mode="redirect" forceRedirectUrl="/">
              <button
                type="button"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.025] px-6 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                I already have an account
              </button>
            </SignInButton>
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
        <span>© {new Date().getFullYear()} Wintech Companies</span>
      </footer>
    </main>
  );
}
