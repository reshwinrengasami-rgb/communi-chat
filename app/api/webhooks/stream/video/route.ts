import { NextResponse } from "next/server";
import { StreamChat } from "stream-chat";
import webpush from "web-push";
import { connectToDatabase } from "@/lib/mongodb";
import PushSubscription from "@/models/PushSubscription";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function getUserId(member: unknown): string | undefined {
  if (!isRecord(member)) return undefined;
  const directId = getString(member.user_id);
  if (directId) return directId;
  return isRecord(member.user) ? getString(member.user.id) : undefined;
}

export async function POST(request: Request) {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!apiKey || !apiSecret || !publicKey || !privateKey || !vapidSubject) {
    console.error("Stream push notification settings are not configured");
    return NextResponse.json(
      { error: "Push notifications are not configured" },
      { status: 500 },
    );
  }

  if (request.headers.get("x-api-key") !== apiKey) {
    return NextResponse.json({ error: "Invalid Stream API key" }, { status: 401 });
  }

  const signature = request.headers.get("x-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing webhook signature" }, { status: 401 });
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  let event: unknown;
  try {
    const streamServer = new StreamChat(apiKey, apiSecret);
    event = streamServer.verifyAndParseWebhook(rawBody, signature);
  } catch (error) {
    console.warn("Rejected an invalid Stream webhook signature", error);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  if (
    !isRecord(event) ||
    (event.type !== "call.ring" && event.type !== "message.new")
  ) {
    return NextResponse.json({ received: true });
  }

  const isMessage = event.type === "message.new";
  const message = isRecord(event.message) ? event.message : undefined;
  const messageSender =
    message && isRecord(message.user) ? message.user : undefined;
  const eventUser = isRecord(event.user) ? event.user : undefined;
  const sender = isMessage ? messageSender ?? eventUser : eventUser;
  const senderId = sender ? getString(sender.id) : undefined;
  const members = Array.isArray(event.members) ? event.members : [];
  const recipientIds = [
    ...new Set(
      members
        .filter(
          (member) =>
            !isMessage ||
            !isRecord(member) ||
            member.notifications_muted !== true,
        )
        .map(getUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ].filter((id) => id !== senderId);

  if (recipientIds.length === 0) {
    return NextResponse.json({ received: true });
  }

  try {
    await connectToDatabase();
    const subscriptions = await PushSubscription.find({
      userId: { $in: recipientIds },
    }).lean();
    if (subscriptions.length === 0) {
      return NextResponse.json({ received: true });
    }

    const senderName = (sender && getString(sender.name)) || "Someone";
    const messageText = message && getString(message.text)?.trim();
    const hasAttachments =
      message && Array.isArray(message.attachments) && message.attachments.length > 0;
    const messageBody = messageText
      ? messageText.slice(0, 120)
      : hasAttachments
        ? "Sent an attachment"
        : "Sent a message";
    const channelName = isRecord(event.channel)
      ? getString(event.channel.name)
      : undefined;
    const channelId =
      getString(event.cid) ?? getString(event.channel_id) ?? "chat";
    const callLabel = event.video === true ? "video call" : "audio call";
    const callId = getString(event.ring_id) ?? getString(event.call_cid) ?? "call";
    const payload = isMessage
      ? JSON.stringify({
          title: channelName ? `${senderName} in ${channelName}` : senderName,
          body: messageBody,
          url: "/",
          tag: `message-${channelId}`,
        })
      : JSON.stringify({
          title: `Incoming ${callLabel}`,
          body: `${senderName} is calling you.`,
          url: "/",
          tag: `call-${callId}`,
        });

    webpush.setVapidDetails(vapidSubject, publicKey, privateKey);
    const deliveries = await Promise.allSettled(
      subscriptions.map((subscription) =>
        webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          payload,
          { TTL: 60, urgency: "high" },
        ),
      ),
    );

    const failedDeliveries: unknown[] = [];
    for (const [index, delivery] of deliveries.entries()) {
      if (delivery.status === "fulfilled") continue;
      const statusCode =
        isRecord(delivery.reason) &&
        typeof delivery.reason.statusCode === "number"
          ? delivery.reason.statusCode
          : undefined;
      if (statusCode === 404 || statusCode === 410) {
        await PushSubscription.deleteOne({
          endpoint: subscriptions[index].endpoint,
        });
      } else {
        console.error("Unable to send a push notification", delivery.reason);
        failedDeliveries.push(delivery.reason);
      }
    }

    if (failedDeliveries.length > 0) {
      return NextResponse.json(
        { error: "Unable to deliver all push notifications" },
        { status: 500 },
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Unable to process Stream push webhook", error);
    return NextResponse.json(
      { error: "Unable to process push notification" },
      { status: 500 },
    );
  }
}
