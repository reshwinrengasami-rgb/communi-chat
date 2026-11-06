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

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const appIsFocused = clients.some(
          (client) => client.focused && client.visibilityState === "visible",
        );
        if (appIsFocused) return;

        return self.registration.showNotification(title, {
          body,
          tag: callCid ? `communichat-call-${callCid}` : "communichat-call",
          data: { callCid },
          requireInteraction: true,
        });
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
          }
          return appWindow.navigate(targetUrl.href).then((client) => client?.focus());
        }

        const targetUrl = new URL("/", self.location.origin);
        if (typeof event.notification.data?.callCid === "string") {
          targetUrl.searchParams.set("call", event.notification.data.callCid);
        }
        return self.clients.openWindow(targetUrl.href);
      },
    ),
  );
});
