import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-[100dvh] w-full items-start justify-center overflow-y-auto px-4 py-[max(1.5rem,env(safe-area-inset-top))] sm:items-center sm:px-5 sm:py-8">
      <SignIn />
    </main>
  );
}
