import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { StreamChat } from "stream-chat";
import { syncClerkUser } from "@/lib/sync-user";

export const runtime = "nodejs";

async function syncChannelMemberProfiles(
  streamServer: StreamChat,
  userId: string,
) {
  const channels = await streamServer.queryChannels(
    { type: "messaging", members: { $in: [userId] } },
    { last_message_at: -1 },
    { limit: 30, state: true, watch: false, message_limit: 0 },
  );
  const memberIds = new Set<string>();

  for (const channel of channels) {
    for (const memberId of Object.keys(channel.state.members)) {
      if (memberId !== userId) memberIds.add(memberId);
    }
  }

  if (memberIds.size === 0) return;

  const clerk = await clerkClient();
  const userIds = [...memberIds];
  const profiles = [];
  for (let index = 0; index < userIds.length; index += 100) {
    const result = await clerk.users.getUserList({
      userId: userIds.slice(index, index + 100),
      limit: 100,
    });
    profiles.push(...result.data);
  }

  for (let index = 0; index < profiles.length; index += 100) {
    await streamServer.upsertUsers(
      profiles.slice(index, index + 100).map((profile) => ({
        id: profile.id,
        name:
          [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
          profile.username ||
          profile.id,
        image: profile.imageUrl,
        username: profile.username ?? "",
      })),
    );
  }
}

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
      username: clerkUser.username ?? "",
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
        username: clerkUser.username ?? "",
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

export async function POST() {
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

  try {
    const clerkUser = await currentUser();
    if (!clerkUser || clerkUser.id !== userId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      "";
    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
      clerkUser.username ||
      email;

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
      name,
      image: clerkUser.imageUrl,
      username: clerkUser.username ?? "",
    });
    await syncChannelMemberProfiles(streamServer, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unable to sync Stream user profile", error);
    return NextResponse.json(
      { error: "Unable to update chat profile" },
      { status: 500 },
    );
  }
}
