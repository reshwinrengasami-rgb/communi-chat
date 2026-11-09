import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { connectToDatabase } from "@/lib/mongodb";
import FirebasePushToken from "@/models/FirebasePushToken";

function messaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase server credentials are not configured.");
  }
  const app = getApps().find((item) => item.name === "communichat-push") ??
    initializeApp(
      { credential: cert({ projectId, clientEmail, privateKey }), projectId },
      "communichat-push",
    );
  return getMessaging(app);
}

export async function sendFirebasePush(userIds: string[], payload: Record<string, string>) {
  await connectToDatabase();
  const subscriptions = await FirebasePushToken.find({ userId: { $in: userIds } }).lean();
  if (subscriptions.length === 0) return { sent: 0, failed: 0 };
  const client = messaging();
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < subscriptions.length; i += 500) {
    const batch = subscriptions.slice(i, i + 500);
    const result = await client.sendEachForMulticast({
      tokens: batch.map((item) => item.token),
      data: payload,
      webpush: { headers: { Urgency: "high", TTL: "60" } },
    });
    sent += result.successCount;
    for (let index = 0; index < result.responses.length; index++) {
      const response = result.responses[index];
      if (response.success) continue;
      const code = response.error?.code;
      if (code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token") {
        await FirebasePushToken.deleteOne({ token: batch[index].token });
      } else {
        failed++;
        console.error("Firebase push delivery failed", code);
      }
    }
  }
  return { sent, failed };
}
