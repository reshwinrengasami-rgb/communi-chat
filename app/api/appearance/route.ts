import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isAppearance } from "@/lib/appearance";
import { connectToDatabase } from "@/lib/mongodb";
import Settings from "@/models/Settings";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectToDatabase();
    const settings = await Settings.findOne({ userId });
    return NextResponse.json({ appearance: settings?.appearance ?? null });
  } catch (error) {
    console.error("Unable to load appearance settings", error);
    return NextResponse.json({ error: "Could not load synced appearance." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let value: unknown;
  try {
    const text = await request.text();
    if (text.length > 410000) {
      return NextResponse.json({ error: "Appearance is too large." }, { status: 413 });
    }
    value = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isAppearance(value)) {
    return NextResponse.json({ error: "Invalid appearance settings." }, { status: 400 });
  }
  try {
    await connectToDatabase();
    await Settings.updateOne(
      { userId },
      { $set: { appearance: value }, $setOnInsert: { userId } },
      { upsert: true, runValidators: true },
    );
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("Unable to save appearance settings", error);
    return NextResponse.json({ error: "Could not save synced appearance." }, { status: 500 });
  }
}
