import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { peopleSearchPattern, peopleSearchTerm } from "@/lib/people-search";
import User from "@/models/User";

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
