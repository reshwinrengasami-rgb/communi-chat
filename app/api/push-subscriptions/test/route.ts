import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { PushSubscription as WebPushSubscription } from "web-push";
import { connectToDatabase } from "@/lib/mongodb";
import { configureWebPush, sendNotification } from "@/lib/web-push";
import PushSubscription from "@/models/PushSubscription";
import { sendFirebasePush } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("type" in body) || !("target" in body) ||
      (body.type !== "firebase" && body.type !== "webpush") ||
      typeof body.target !== "string" || body.target.length === 0 || body.target.length > 4096) {
    return NextResponse.json({ error: "Invalid notification target." }, { status: 400 });
  }

  const payload = {
    type: "message",
    title: "CommuniChat test notification",
    body: "Push notifications are reaching this device.",
  };
  try {
    if (body.type === "firebase") {
      const result = await sendFirebasePush([userId], payload, body.target);
      if (result.sent === 0) {
        return NextResponse.json(
          { error: "This device could not receive the test. Re-enable notifications and try again." },
          { status: result.failed > 0 ? 502 : 404 },
        );
      }
    } else {
      await connectToDatabase();
      const subscription = await PushSubscription.findOne({ userId, endpoint: body.target }).lean<{
        endpoint: string;
        keys: { p256dh: string; auth: string };
      } | null>();
      if (!subscription) {
        return NextResponse.json({ error: "This device is not subscribed. Re-enable notifications and try again." }, { status: 404 });
      }
      configureWebPush();
      try {
        const pushSubscription: WebPushSubscription = {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        };
        await sendNotification(pushSubscription, JSON.stringify(payload), { TTL: 60 });
      } catch (error) {
        if (typeof error === "object" && error !== null && "statusCode" in error &&
            (error.statusCode === 404 || error.statusCode === 410)) {
          await PushSubscription.deleteOne({ userId, endpoint: body.target });
          return NextResponse.json({ error: "This subscription has expired. Re-enable notifications and try again." }, { status: 410 });
        }
        throw error;
      }
    }
    return NextResponse.json({ sent: 1 });
  } catch (error) {
    console.error("Unable to send a test notification", error);
    return NextResponse.json({ error: "Could not send this device's test notification. Check the server push configuration." }, { status: 500 });
  }
}
