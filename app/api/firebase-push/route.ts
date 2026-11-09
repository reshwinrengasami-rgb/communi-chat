import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import FirebasePushToken from "@/models/FirebasePushToken";

export const runtime = "nodejs";

async function tokenFromRequest(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("token" in body)) return null;
    const token = body.token;
    return typeof token === "string" && token.length > 0 && token.length <= 4096
      ? token : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = await tokenFromRequest(request);
  if (!token) return NextResponse.json({ error: "Invalid Firebase token" }, { status: 400 });
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return NextResponse.json({ error: "Firebase server credentials are not configured." }, { status: 503 });
  }
  try {
    await connectToDatabase();
    await FirebasePushToken.updateOne({ token }, { $set: { userId, token } }, { upsert: true });
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("Unable to save Firebase push token", error);
    return NextResponse.json({ error: "Could not save this device." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = await tokenFromRequest(request);
  if (!token) return NextResponse.json({ error: "Invalid Firebase token" }, { status: 400 });
  try {
    await connectToDatabase();
    await FirebasePushToken.deleteOne({ userId, token });
    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("Unable to remove Firebase push token", error);
    return NextResponse.json({ error: "Could not remove this device." }, { status: 500 });
  }
}
