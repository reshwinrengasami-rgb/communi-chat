import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { peopleSearchPattern, peopleSearchTerm } from "@/lib/people-search";
import User from "@/models/User";
import SearchRateLimit from "@/models/SearchRateLimit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = peopleSearchTerm(new URL(request.url).searchParams.get("q") ?? "");
  if (!search) {
    return NextResponse.json({ error: "Enter between 2 and 80 characters." }, { status: 400 });
  }
  try {
    await connectToDatabase();
    const now = Date.now();
    const windowMs = 60_000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const limit = await SearchRateLimit.findOneAndUpdate(
      { _id: `${userId}:${windowStart}` },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(windowStart + windowMs * 2) },
      },
      { upsert: true, new: true },
    );
    if (limit.count > 30) {
      return NextResponse.json(
        { error: "Too many searches. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((windowStart + windowMs - now) / 1000)) } },
      );
    }
    const pattern = peopleSearchPattern(search);
    const users = await User.find({
      clerkId: { $ne: userId },
      $or: [
        { username: pattern },
        { name: pattern, $expr: { $ne: [{ $toLower: "$name" }, { $toLower: "$email" }] } },
      ],
    }).select("clerkId name username imageUrl email").sort({ name: 1 }).limit(20)
      .lean<Array<{ clerkId: string; name: string; username?: string; imageUrl?: string; email: string }>>();
    return NextResponse.json({
      users: users.map((user) => ({
        id: user.clerkId,
        name: user.name.toLowerCase() === user.email.toLowerCase()
          ? user.username || "CommuniChat user"
          : user.name,
        image: user.imageUrl || undefined,
      })),
    });
  } catch (error) {
    console.error("Unable to search people", error);
    return NextResponse.json({ error: "Could not search people." }, { status: 500 });
  }
}
