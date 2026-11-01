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
    console.error("Stream call push notification settings are not configured");
    return NextResponse.json(
      { error: "Call notifications are not configured" },
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

  if (!isRecord(event) || event.type !== "call.ring") {
    return NextResponse.json({ received: true });
  }

  const members = Array.isArray(event.members) ? event.members : [];
  const callerId = isRecord(event.user) ? getString(event.user.id) : undefined;
  const recipientIds = [
    ...new Set(members.map(getUserId).filter((id): id is string => Boolean(id))),
  ].filter((id) => id !== callerId);

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

    const callerName =
      isRecord(event.user) && getString(event.user.name)
        ? getString(event.user.name)
        : "Someone";
    const callLabel = event.video === true ? "video call" : "audio call";
    const ringId = getString(event.ring_id) ?? getString(event.call_cid) ?? "call";
    const payload = JSON.stringify({
      title: `Incoming ${callLabel}`,
      body: `${callerName} is calling you.`,
      url: "/",
      tag: `call-${ringId}`,
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
        console.error("Unable to send a call push notification", delivery.reason);
        failedDeliveries.push(delivery.reason);
      }
    }

    if (failedDeliveries.length > 0) {
      return NextResponse.json(
        { error: "Unable to deliver all call notifications" },
        { status: 500 },
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Unable to process Stream call webhook", error);
    return NextResponse.json(
      { error: "Unable to process call notification" },
      { status: 500 },
    );
  }
}
