import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import PushSubscription from "@/models/PushSubscription";

export const runtime = "nodejs";

function hasPushConfiguration() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT &&
      process.env.NEXT_PUBLIC_STREAM_API_KEY &&
      process.env.STREAM_API_SECRET &&
      process.env.MONGODB_URI,
  );
}

function isValidEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string") return false;
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (host === "fcm.googleapis.com" ||
        host.endsWith(".fcm.googleapis.com") ||
        host === "push.services.mozilla.com" ||
        host.endsWith(".push.services.mozilla.com") ||
        host === "web.push.apple.com")
    );
  } catch {
    return false;
  }
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPushConfiguration()) {
    console.error("Web Push configuration is incomplete");
    return NextResponse.json(
      {
        error:
          "Push notifications are not configured. Set both VAPID keys, VAPID_SUBJECT, the Stream API credentials, and MONGODB_URI.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const subscription = body as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (
    !isValidEndpoint(subscription.endpoint) ||
    typeof subscription.keys?.p256dh !== "string" ||
    typeof subscription.keys.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await connectToDatabase();
  await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    {
      $set: {
        userId,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
    },
    { upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  return NextResponse.json({ enabled: true });
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const endpoint =
    body && typeof body === "object"
      ? (body as { endpoint?: unknown }).endpoint
      : undefined;
  if (!isValidEndpoint(endpoint)) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await connectToDatabase();
  await PushSubscription.deleteOne({ userId, endpoint });
  return NextResponse.json({ enabled: false });
}
