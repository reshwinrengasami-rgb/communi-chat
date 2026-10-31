import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { StreamChat } from "stream-chat";
import { syncClerkUser } from "@/lib/sync-user";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;
  if (!apiKey || !apiSecret) {
    console.error("Stream credentials are not configured");
    return NextResponse.json(
      { error: "Messaging service is not configured" },
      { status: 500 },
    );
  }

  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== userId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    "";

  try {
    await syncClerkUser({
      id: clerkUser.id,
      emailAddresses: email ? [{ emailAddress: email }] : [],
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      username: clerkUser.username,
      imageUrl: clerkUser.imageUrl,
    });

    const streamServer = StreamChat.getInstance(apiKey, apiSecret);
    await streamServer.upsertUser({
      id: userId,
      name:
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        clerkUser.username ||
        email,
      image: clerkUser.imageUrl,
    });

    return NextResponse.json({
      apiKey,
      token: streamServer.createToken(userId),
      user: {
        id: userId,
        name:
          [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
          clerkUser.username ||
          email,
        image: clerkUser.imageUrl,
      },
    });
  } catch (error) {
    console.error("Unable to provision Stream user", error);
    return NextResponse.json(
      { error: "Unable to initialize messaging" },
      { status: 500 },
    );
  }
}
