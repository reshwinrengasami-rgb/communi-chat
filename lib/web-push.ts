import { sendNotification, setVapidDetails } from "web-push";

export function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "Web Push requires NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_VAPID_SUBJECT.",
    );
  }

  setVapidDetails(subject, publicKey, privateKey);
}

export function getWebPushPublicKey() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY is not configured.");
  }
  return publicKey;
}

export { sendNotification };
