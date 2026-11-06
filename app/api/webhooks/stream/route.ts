import { NextResponse } from "next/server";
import { StreamChat } from "stream-chat";
import type { PushSubscription as WebPushSubscription } from "web-push";
import { connectToDatabase } from "@/lib/mongodb";
import { configureWebPush, sendNotification } from "@/lib/web-push";
import PushSubscription from "@/models/PushSubscription";

export const runtime = "nodejs";

type CallRingEvent = {
  type: "call.ring";
  call_cid?: unknown;
  members?: Array<{ user_id?: unknown }>;
  call?: {
    cid?: unknown;
    id?: unknown;
    type?: unknown;
    created_by?: { id?: unknown; name?: unknown } | null;
    members?: unknown;
  };
};

type MessageNewEvent = {
  type: "message.new";
  id?: unknown;
  cid?: unknown;
  channel_id?: unknown;
  channel_type?: unknown;
  user_id?: unknown;
  user?: unknown;
  members?: unknown;
  channel?: unknown;
  message?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCallRingEvent(value: unknown): CallRingEvent | null {
  if (!isRecord(value) || value.type !== "call.ring") return null;
  const call = isRecord(value.call) ? value.call : undefined;
  const rawMembers = Array.isArray(value.members)
    ? value.members
    : call?.members;
  const members = Array.isArray(rawMembers)
    ? rawMembers.filter(
        (member): member is { user_id?: unknown } =>
          isRecord(member) &&
          (member.user_id === undefined || typeof member.user_id === "string"),
      )
    : undefined;
  const createdBy = isRecord(call?.created_by)
    ? {
        id: call.created_by.id,
        name: call.created_by.name,
      }
    : null;

  return {
    type: "call.ring",
    call_cid: value.call_cid,
    members,
    call: call
      ? {
          cid: call.cid,
          id: call.id,
          type: call.type,
          created_by: createdBy,
          members,
        }
      : undefined,
  };
}

function getPushErrorStatus(error: unknown) {
  if (!isRecord(error) || typeof error.statusCode !== "number") return null;
  return error.statusCode;
}

async function sendPushToUsers(
  userIds: string[],
  payload: string,
) {
  if (userIds.length === 0) return { sent: 0, failed: 0 };
  configureWebPush();
  await connectToDatabase();
  const subscriptions = await PushSubscription.find({
    userId: { $in: userIds },
  }).lean();
  const deliveries = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      const pushSubscription: WebPushSubscription = {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      };
      try {
        await sendNotification(pushSubscription, payload, {
          TTL: 60,
        });
        return "sent" as const;
      } catch (error) {
        const status = getPushErrorStatus(error);
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ endpoint: subscription.endpoint });
          return "expired" as const;
        }
        throw error;
      }
    }),
  );
  const sent = deliveries.filter(
    (delivery) => delivery.status === "fulfilled" && delivery.value === "sent",
  ).length;
  const failed = deliveries.filter(
    (delivery) => delivery.status === "rejected",
  ).length;
  if (failed > 0) {
    console.error(`Web Push delivery failed for ${failed} subscription(s)`);
  }
  return { sent, failed };
}

function getUserId(value: unknown) {
  if (!isRecord(value)) return "";
  if (typeof value.user_id === "string") return value.user_id;
  if (typeof value.id === "string") return value.id;
  if (isRecord(value.user) && typeof value.user.id === "string") {
    return value.user.id;
  }
  return "";
}

function getMemberIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map(getUserId)
        .filter((userId): userId is string => userId.length > 0),
    ),
  ];
}

export async function POST(request: Request) {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;
  const signature = request.headers.get("x-signature");
  if (!apiKey || !apiSecret) {
    console.error("Stream webhook credentials are not configured");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }
  if (!signature) {
    return NextResponse.json({ error: "Missing webhook signature" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1024 * 1024) {
    return NextResponse.json({ error: "Webhook payload is too large" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 1024 * 1024) {
    return NextResponse.json({ error: "Webhook payload is too large" }, { status: 413 });
  }

  let event: unknown;
  try {
    const streamServer = StreamChat.getInstance(apiKey, apiSecret);
    if (!streamServer.verifyWebhook(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
    event = JSON.parse(rawBody) as unknown;
  } catch (error) {
    console.error("Unable to validate Stream webhook", error);
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }

  try {
    const callRing = getCallRingEvent(event);
    if (callRing) {
      const call = callRing.call;
      const callCid =
        typeof callRing.call_cid === "string"
          ? callRing.call_cid
          : typeof call?.cid === "string"
            ? call.cid
            : "";
      const callerId =
        typeof call?.created_by?.id === "string" ? call.created_by.id : "";
      const recipientIds = getMemberIds(callRing.members).filter(
        (userId) => userId !== callerId,
      );
      if (!callCid || recipientIds.length === 0) {
        console.error("Stream call.ring webhook is missing call or recipient data");
        return NextResponse.json(
          { error: "Invalid call.ring event" },
          { status: 400 },
        );
      }
      const callerName =
        typeof call?.created_by?.name === "string"
          ? call.created_by.name
          : "A teammate";
      const result = await sendPushToUsers(
        recipientIds,
        JSON.stringify({
          type: "call",
          title: "Incoming call",
          body: `${callerName} invited you to join a call.`,
          callCid,
        }),
      );
      return NextResponse.json({ received: true, ...result });
    }

    if (!isRecord(event) || event.type !== "message.new") {
      return NextResponse.json({ received: true, ignored: true });
    }

    const messageEvent = event as MessageNewEvent;
    const message = isRecord(messageEvent.message)
      ? messageEvent.message
      : undefined;
    const channel = isRecord(messageEvent.channel)
      ? messageEvent.channel
      : undefined;
    const senderId =
      getUserId(message?.user) ||
      getUserId(messageEvent.user) ||
      (typeof messageEvent.user_id === "string" ? messageEvent.user_id : "") ||
      (typeof message?.user_id === "string" ? message.user_id : "");
    let channelType =
      typeof messageEvent.channel_type === "string"
        ? messageEvent.channel_type
        : typeof channel?.type === "string"
          ? channel.type
          : "";
    let channelId =
      typeof messageEvent.channel_id === "string"
        ? messageEvent.channel_id
        : typeof channel?.id === "string"
          ? channel.id
          : "";
    const channelCid =
      (typeof messageEvent.cid === "string" && messageEvent.cid) ||
      (typeof channel?.cid === "string" && channel.cid) ||
      "";
    if ((!channelType || !channelId) && channelCid.includes(":")) {
      const separatorIndex = channelCid.indexOf(":");
      channelType ||= channelCid.slice(0, separatorIndex);
      channelId ||= channelCid.slice(separatorIndex + 1);
    }
    if (!senderId || !channelType || !channelId) {
      console.error("Stream message.new webhook is missing sender or channel data");
      return NextResponse.json(
        { error: "Invalid message.new event" },
        { status: 400 },
      );
    }

    let recipientIds = getMemberIds(messageEvent.members).filter(
      (userId) => userId !== senderId,
    );
    if (recipientIds.length === 0 && Array.isArray(channel?.members)) {
      recipientIds = getMemberIds(channel.members).filter(
        (userId) => userId !== senderId,
      );
    }
    if (recipientIds.length === 0) {
      const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
      const apiSecret = process.env.STREAM_API_SECRET;
      if (!apiKey || !apiSecret) {
        throw new Error("Stream credentials are not configured");
      }
      const streamServer = StreamChat.getInstance(apiKey, apiSecret);
      const channelResponse = await streamServer
        .channel(channelType, channelId)
        .query({ state: true, watch: false });
      recipientIds = getMemberIds(channelResponse.members).filter(
        (userId) => userId !== senderId,
      );
    }
    if (recipientIds.length === 0) {
      return NextResponse.json({ received: true, sent: 0, failed: 0 });
    }

    const senderName =
      (isRecord(message?.user) && typeof message.user.name === "string"
        ? message.user.name
        : isRecord(messageEvent.user) &&
            typeof messageEvent.user.name === "string"
          ? messageEvent.user.name
          : "Someone");
    const channelName =
      typeof channel?.name === "string" ? channel.name.trim() : "";
    const result = await sendPushToUsers(
      recipientIds,
      JSON.stringify({
        type: "message",
        title: channelName
          ? `${senderName} in ${channelName}`
          : `New message from ${senderName}`,
        body: "Open CommuniChat to read the message.",
        messageId:
          (typeof message?.id === "string" && message.id) ||
          (typeof messageEvent.id === "string" && messageEvent.id) ||
          "",
        channelCid: channelCid || `${channelType}:${channelId}`,
      }),
    );
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("Unable to process Stream push webhook", error);
    return NextResponse.json(
      { error: "Unable to deliver notifications" },
      { status: 500 },
    );
  }
}
