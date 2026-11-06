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
  call?: {
    cid?: unknown;
    id?: unknown;
    type?: unknown;
    created_by?: { id?: unknown; name?: unknown } | null;
    members?: Array<{ user_id?: unknown }>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCallRingEvent(value: unknown): CallRingEvent | null {
  if (!isRecord(value) || value.type !== "call.ring") return null;
  const call = isRecord(value.call) ? value.call : undefined;
  const members = Array.isArray(call?.members)
    ? call.members.filter(
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

  const callRing = getCallRingEvent(event);
  if (!callRing) return NextResponse.json({ received: true, ignored: true });

  const call = callRing.call;
  const callCid =
    typeof callRing.call_cid === "string"
      ? callRing.call_cid
      : typeof call?.cid === "string"
        ? call.cid
        : "";
  const callerId =
    typeof call?.created_by?.id === "string" ? call.created_by.id : "";
  const recipientIds = [
    ...new Set(
      (call?.members ?? [])
        .map((member) => member.user_id)
        .filter(
          (userId): userId is string =>
            typeof userId === "string" && userId.length > 0 && userId !== callerId,
        ),
    ),
  ];

  if (!callCid || recipientIds.length === 0) {
    console.error("Stream call.ring webhook is missing call or recipient data");
    return NextResponse.json({ error: "Invalid call.ring event" }, { status: 400 });
  }

  try {
    configureWebPush();
    await connectToDatabase();
    const subscriptions = await PushSubscription.find({
      userId: { $in: recipientIds },
    }).lean();
    const callerName =
      typeof call?.created_by?.name === "string"
        ? call.created_by.name
        : "A teammate";
    const callType = call?.type === "audio_call" ? "audio" : "video";
    const payload = JSON.stringify({
      title: `Incoming ${callType} call`,
      body: `${callerName} invited you to join a call.`,
      callCid,
    });

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

    const sentCount = deliveries.filter(
      (delivery) => delivery.status === "fulfilled" && delivery.value === "sent",
    ).length;
    const failedCount = deliveries.filter(
      (delivery) => delivery.status === "rejected",
    ).length;
    if (failedCount > 0) {
      console.error(`Web Push delivery failed for ${failedCount} subscription(s)`);
    }

    return NextResponse.json({
      received: true,
      sent: sentCount,
      failed: failedCount,
    });
  } catch (error) {
    console.error("Unable to process Stream call.ring webhook", error);
    return NextResponse.json(
      { error: "Unable to deliver call notifications" },
      { status: 500 },
    );
  }
}
