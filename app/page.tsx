import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ChatDashboard } from "@/components/chat-dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

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
