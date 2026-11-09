import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { PushSubscription as WebPushSubscription } from "web-push";
import { connectToDatabase } from "@/lib/mongodb";
import { configureWebPush, sendNotification } from "@/lib/web-push";
import PushSubscription from "@/models/PushSubscription";
import { sendFirebasePush } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function getPushErrorStatus(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("statusCode" in error) ||
    typeof error.statusCode !== "number"
  ) {
    return null;
  }
  return error.statusCode;
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const firebaseResult = await sendFirebasePush([userId], {
      type: "message",
      title: "CommuniChat test notification",
      body: "Push notifications are reaching this device.",
    }).catch((error: unknown) => {
      console.error("Firebase test delivery failed", error);
      return { sent: 0, failed: 1 };
    });
    if (firebaseResult.sent > 0) return NextResponse.json(firebaseResult);
    configureWebPush();
    await connectToDatabase();
    const subscriptions = await PushSubscription.find({ userId }).lean();
    if (subscriptions.length === 0) {
      return NextResponse.json(
        { error: "No notification subscription found. Turn notifications off and on, then try again." },
        { status: 404 },
      );
    }

    const payload = JSON.stringify({
      title: "CommuniChat test notification",
      body: "Push notifications are reaching this device.",
      callCid: "",
    });
    const deliveries = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        const pushSubscription: WebPushSubscription = {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        };
        try {
          await sendNotification(pushSubscription, payload, { TTL: 60 });
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
      const statuses = deliveries
        .filter((delivery) => delivery.status === "rejected")
        .map((delivery) =>
          delivery.status === "rejected"
            ? getPushErrorStatus(delivery.reason)
            : null,
        );
      console.error("Web Push test delivery failed", { failed, statuses });
    }

    if (sent === 0) {
      return NextResponse.json(
        { error: "The push service rejected delivery. Re-enable notifications and check the server VAPID keys." },
        { status: 502 },
      );
    }

    return NextResponse.json({ sent, failed });
  } catch (error) {
    console.error("Unable to send a Web Push test notification", error);
    return NextResponse.json(
      { error: "Could not send the test notification. Check the server VAPID and database configuration." },
      { status: 500 },
    );
  }
}
