import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import PushSubscription from "@/models/PushSubscription";
import { configureWebPush, getWebPushPublicKey } from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

function isValidEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (host === "fcm.googleapis.com" ||
        host.endsWith(".fcm.googleapis.com") ||
        host === "push.services.mozilla.com" ||
        host.endsWith(".push.services.mozilla.com") ||
        host === "web.push.apple.com" ||
        host.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidKey(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    base64UrlPattern.test(value)
  );
}

export async function GET() {
  try {
    configureWebPush();
    return NextResponse.json({ publicKey: getWebPushPublicKey() });
  } catch (error) {
    console.error("Web Push is not configured", error);
    return NextResponse.json(
      {
        error:
          "Browser push requires the VAPID public key, private key, and HTTPS subject on the server.",
      },
      { status: 503 },
    );
  }
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

  if (!isRecord(body) || !isRecord(body.keys)) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  const { endpoint, keys } = body;
  if (
    !isValidEndpoint(endpoint) ||
    !isValidKey(keys.p256dh, 200) ||
    !isValidKey(keys.auth, 100)
  ) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  try {
    configureWebPush();
  } catch (error) {
    console.error("Web Push is not configured", error);
    return NextResponse.json(
      { error: "Browser push is not fully configured on the server." },
      { status: 503 },
    );
  }

  try {
    await connectToDatabase();
    await PushSubscription.updateOne(
      { endpoint },
      {
        $set: {
          userId,
          endpoint,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
        },
      },
      { upsert: true, runValidators: true },
    );
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("Unable to save browser push subscription", error);
    return NextResponse.json(
      { error: "Could not save this browser subscription." },
      { status: 500 },
    );
  }
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

  const endpoint = isRecord(body) ? body.endpoint : undefined;
  if (!isValidEndpoint(endpoint)) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await connectToDatabase();
  await PushSubscription.deleteOne({ userId, endpoint });
  return NextResponse.json({ removed: true });
}
