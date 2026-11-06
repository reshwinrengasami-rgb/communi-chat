import { auth, currentUser } from "@clerk/nextjs/server";
import { ChatDashboard } from "@/components/chat-dashboard";
import { LandingPage } from "@/app/landing-page";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { userId } = await auth();
  if (!userId) return <LandingPage />;

  const clerkUser = await currentUser();
  if (!clerkUser) return <LandingPage />;

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    "";

  return (
    <ChatDashboard
      user={{
        id: clerkUser.id,
        name:
          [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
          clerkUser.username ||
          email,
        email,
        imageUrl: clerkUser.imageUrl,
      }}
    />
  );
}
