import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { StreamChat } from "stream-chat";

export const runtime = "nodejs";

type MemberAction = "add" | "remove" | "promote" | "demote";

function isMemberAction(value: unknown): value is MemberAction {
  return (
    value === "add" ||
    value === "remove" ||
    value === "promote" ||
    value === "demote"
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ channelId: string }> },
) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("action" in body) ||
    !("userId" in body) ||
    !isMemberAction(body.action) ||
    typeof body.userId !== "string" ||
    !body.userId.trim()
  ) {
    return NextResponse.json({ error: "Invalid member action" }, { status: 400 });
  }

  const action = body.action;
  const targetUserId = body.userId.trim();
  const { channelId } = await context.params;

  try {
    const streamServer = StreamChat.getInstance(apiKey, apiSecret);
    const channel = streamServer.channel("messaging", channelId);
    const response = await channel.query({
      state: true,
      members: { limit: 100 },
    });

    const isGroupChannel = Boolean(
      response.channel.is_group ||
        (response.channel.name && response.members.length > 2),
    );
    if (response.channel.type !== "messaging" || !isGroupChannel) {
      return NextResponse.json(
        { error: "Member management is only available in group channels" },
        { status: 404 },
      );
    }

    const creatorId = response.channel.created_by_id;
    const requesterIsCreator = creatorId === userId;
    const requesterIsModerator = response.members.some(
      (member) =>
        member.user_id === userId &&
        member.channel_role === "channel_moderator",
    );

    if (!requesterIsCreator && !requesterIsModerator) {
      return NextResponse.json(
        { error: "Only group admins can manage members" },
        { status: 403 },
      );
    }

    const targetMember = response.members.find(
      (member) => member.user_id === targetUserId,
    );

    if (action === "add") {
      if (targetMember) {
        return NextResponse.json(
          { error: "This person is already in the group" },
          { status: 409 },
        );
      }
      await channel.addMembers([targetUserId]);
    } else {
      if (!targetMember) {
        return NextResponse.json(
          { error: "This person is not in the group" },
          { status: 404 },
        );
      }

      if (targetUserId === creatorId) {
        return NextResponse.json(
          { error: "The group creator cannot be removed or demoted" },
          { status: 400 },
        );
      }

      if (action === "remove") {
        if (targetUserId === userId) {
          return NextResponse.json(
            { error: "You cannot remove yourself as a group admin" },
            { status: 400 },
          );
        }
        await channel.removeMembers([targetUserId]);
      } else {
        if (!requesterIsCreator) {
          return NextResponse.json(
            { error: "Only the group creator can change admin roles" },
            { status: 403 },
          );
        }

        if (action === "promote") {
          if (targetMember.channel_role === "channel_moderator") {
            return NextResponse.json(
              { error: "This person is already an admin" },
              { status: 409 },
            );
          }
          await channel.addModerators([targetUserId]);
        } else {
          if (targetMember.channel_role !== "channel_moderator") {
            return NextResponse.json(
              { error: "This person is not an admin" },
              { status: 409 },
            );
          }
          await channel.demoteModerators([targetUserId]);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unable to update group members", error);
    return NextResponse.json(
      { error: "Unable to update group members" },
      { status: 500 },
    );
  }
}
