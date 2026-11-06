self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.error("Invalid push notification payload", error);
  }

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

  event.waitUntil(
    self.registration.showNotification(title, {
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
    }),
  );
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
          if (typeof event.notification.data?.callCid === "string") {
            targetUrl.searchParams.set("call", event.notification.data.callCid);
          } else if (typeof event.notification.data?.channelCid === "string") {
            targetUrl.searchParams.set(
              "channel",
              event.notification.data.channelCid,
            );
          }
          return appWindow.navigate(targetUrl.href).then((client) => client?.focus());
        }

        const targetUrl = new URL("/", self.location.origin);
        if (typeof event.notification.data?.callCid === "string") {
          targetUrl.searchParams.set("call", event.notification.data.callCid);
        } else if (typeof event.notification.data?.channelCid === "string") {
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
