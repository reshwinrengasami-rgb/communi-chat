import {
  verifyWebhook,
  type WebhookEvent,
} from "@clerk/nextjs/webhooks";
import { NextResponse, type NextRequest } from "next/server";
import { StreamChat } from "stream-chat";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let event: WebhookEvent;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    console.error("Unable to verify Clerk webhook", error);
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }

  if (event.type !== "user.created" && event.type !== "user.updated") {
    return NextResponse.json({ received: true });
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

  const { id, first_name, last_name, username, image_url } = event.data;
  const name =
    [first_name, last_name].filter(Boolean).join(" ").trim() ||
    username ||
    id;

  try {
    const streamServer = StreamChat.getInstance(apiKey, apiSecret);
    await streamServer.upsertUser({
      id,
      name,
      image: image_url,
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Unable to sync Clerk profile to Stream", error);
    return NextResponse.json(
      { error: "Unable to update chat profile" },
      { status: 500 },
    );
  }
}
