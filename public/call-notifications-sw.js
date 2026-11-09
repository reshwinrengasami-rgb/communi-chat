self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function showCommuniChatNotification(payload) {
  const title =
    typeof payload.title === "string" ? payload.title : "Incoming call";
  const body =
    typeof payload.body === "string"
      ? payload.body
      : "Someone invited you to join a CommuniChat call.";
  const callCid = typeof payload.callCid === "string" ? payload.callCid : "";
  const channelCid =
    typeof payload.channelCid === "string" ? payload.channelCid : "";
  const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
  const isCall = payload.type === "call";

  return self.registration.showNotification(title, {
      body,
      tag: isCall
        ? `communichat-call-${callCid}`
        : messageId
          ? `communichat-message-${messageId}`
          : "communichat-message",
      data: { callCid, channelCid },
      requireInteraction: isCall,
      silent: false,
      vibrate: isCall ? [300, 120, 300, 120, 500] : [180, 80, 180],
    });
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.error("Invalid push notification payload", error);
  }
  // Firebase's own listener handles FCM envelopes.
  if (payload.from && payload.data) return;
  event.stopImmediatePropagation();
  event.waitUntil(showCommuniChatNotification(payload));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clients) => {
        const appWindow = clients.find((client) => {
          return new URL(client.url).origin === self.location.origin;
        });

        if (appWindow) {
          const targetUrl = new URL("/", self.location.origin);
          if (event.notification.data?.callCid) {
            targetUrl.searchParams.set("call", event.notification.data.callCid);
          } else if (event.notification.data?.channelCid) {
            targetUrl.searchParams.set(
              "channel",
              event.notification.data.channelCid,
            );
          }
          return appWindow.navigate(targetUrl.href).then((client) => client?.focus());
        }

        const targetUrl = new URL("/", self.location.origin);
        if (event.notification.data?.callCid) {
          targetUrl.searchParams.set("call", event.notification.data.callCid);
        } else if (event.notification.data?.channelCid) {
          targetUrl.searchParams.set(
            "channel",
            event.notification.data.channelCid,
          );
        }
        return self.clients.openWindow(targetUrl.href);
      },
    ),
  );
});

const firebaseConfig = new URL(self.location.href).searchParams.get("firebase");
if (firebaseConfig) {
  importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");
  firebase.initializeApp(JSON.parse(firebaseConfig));
  firebase.messaging().onBackgroundMessage((payload) =>
    showCommuniChatNotification(payload.data || {}),
  );
}
