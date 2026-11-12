# Communichat

Communichat is a dark-first real-time messaging dashboard built with the Next.js App Router, Clerk, Stream Chat, Stream Video, and MongoDB/Mongoose.
## Requirements

- Node.js 20.9+
- A Clerk application
- A Stream application with Chat and Video enabled
- A MongoDB database

## Run locally

1. Copy `.env.example` to `.env.local` and fill in the credentials below.
2. Install dependencies with `npm install`.
3. Start the development server with `npm run dev`.
4. Open `http://localhost:3000` and create an account.

### Environment variables

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk application API keys |
| `CLERK_SECRET_KEY` | Clerk application API keys |
| `NEXT_PUBLIC_STREAM_API_KEY` | Stream application dashboard |
| `STREAM_API_SECRET` | Stream application dashboard; server-side only |
| `MONGODB_URI` | MongoDB connection string |
| `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Matching Web Push private key; server-side only |
| `WEB_PUSH_VAPID_SUBJECT` | Public HTTPS URL for your app, such as `https://your-domain.example` |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase console web app configuration |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Firebase Cloud Messaging web push public key |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase service account credentials, server-side only |

The authenticated `/api/stream/token` route provisions the signed-in user in Stream and upserts their MongoDB profile/settings. When someone opens Communichat, the authenticated profile-sync request also refreshes the latest Clerk names and photos for members of their recent chats in Stream. This avoids requiring a Clerk webhook; profile changes sync the next time a chat member opens Communichat.

## Included features

- Clerk sign-in/sign-up and protected workspace routes
- User and settings Mongoose models, with idempotent profile synchronization
- Server-issued Stream user tokens; the Stream secret is never sent to the browser
- Real-time Stream messaging with channel lists, direct messages, group channels, media uploads, typing indicators, read receipts, and threaded replies
- GIF search and sending through Stream's built-in `/giphy` command, with no separate Giphy API key
- Stream Video calling overlay with microphone, camera, screen-share, and leave controls
- Ringing call invitations that recipients can accept or decline, with incoming video requested at up to 720p when network conditions allow
- A public landing page and responsive call prompts, including a full-screen incoming-call prompt on mobile
- Browser push notifications for incoming calls and an optional in-page ringtone
- Recipients who open Communichat while a call is still active can find and join that call
- Responsive dashboard layout and dark theme

Create a direct message or group channel from the **+** button in the conversation rail. Use the **GIF** button next to the composer to search and send a GIF (leave the search empty for a random GIF); Stream's Giphy command must be enabled for the channel type in the Stream dashboard. Call buttons invite members of the selected conversation; recipients can join or decline from the incoming call prompt. Each invite creates a new Stream call and sends the ring event with the call request. Video resolution is adaptive, so network conditions and camera hardware may result in a lower resolution. Stream's channel permissions and upload settings are managed in the Stream dashboard. For a production deployment, configure Clerk's allowed origins and Stream's production permissions.

The people picker searches registered profiles through an authenticated server
endpoint after at least two characters of a name or username are entered. It
does not return email addresses or list users for an empty search. This alone
is not a complete directory privacy boundary: users with Stream user-query
permission may still query Stream directly. Restrict that permission in the
Stream dashboard and verify that existing chat and call flows still work.
In calls, mobile devices can switch cameras when the camera is enabled. Screen
sharing depends on browser and platform support and is not guaranteed in mobile
WebViews.

Use the palette button in a conversation header to change the top button size,
your outgoing bubble color, and the chat background color or photo. Photos must
be PNG, JPEG, or WebP and smaller than 290 KB. Settings are stored on this
device by default. Enabling account sync stores them, including the photo, in
MongoDB; existing synced settings replace this device's settings when sync is
enabled. Disabling sync stops this device updating the account copy; it does not
delete the account copy or turn off sync on other devices.

On Android, accepting an incoming call from its notification opens CommuniChat
and joins the call automatically. Opening the notification without accepting
still shows the incoming-call prompt. The website must be deployed with this
change before the Android notification's Accept action can join automatically.
Android may still ask for microphone or camera permission.

### Browser push setup

For Firebase Cloud Messaging, create a **web app** in your Firebase project and
enable Cloud Messaging. Set the five `NEXT_PUBLIC_FIREBASE_*` values from the
web app configuration and Cloud Messaging web push certificate, and set the
three server-only `FIREBASE_*` service account values in your hosting provider.
The private key must stay secret; escaped `\n` sequences are supported.
Configure the Stream webhook in step 3 below and deploy the site. Sign in,
enable the bell, allow notifications, then use the test button. If the bell was
already enabled using Web Push, turn it off and on to switch to FCM. Browsers
unsupported by Firebase continue to use Web Push; keep its VAPID settings for
those browsers and existing subscriptions. FCM background delivery depends on
the browser and operating system; a force-stopped browser may not receive pushes.
Stream does not support web push through its native push providers, so browser
FCM is delivered by the signed Stream webhook and Firebase Admin integration,
not by a GetStream `firebase-web` provider. See
[Stream's push notification documentation](https://getstream.io/docs/platform/push-notifications/).

Android uses its own Stream Firebase push provider rather than browser FCM.
Configure `firebase-android` with the Firebase service account in the Stream
dashboard, enable message push for the channel type, configure high-priority
message delivery on the sending side, and permit app notifications on the
phone. Deploy the website as well as installing the APK: the website closes
the Android WebView's chat connection when the app is backgrounded and
restores it on return, allowing Stream to consider it offline for push.
Stream push eligibility, other active sessions, and device battery restrictions
also affect delivery. Sending a test from one signed-in device to another and
checking Android logs and the Stream dashboard are necessary to confirm actual
delivery.

1. Generate a VAPID key pair once with `npx web-push generate-vapid-keys`. Keep the private key secret and do not regenerate it after users subscribe.
2. Set `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_VAPID_SUBJECT` in `.env.local` and in your hosting provider's environment settings. The subject can be your public HTTPS site URL; the private key must not use a `NEXT_PUBLIC_` prefix.
3. Deploy the site over HTTPS. In the Stream dashboard, add a webhook to `https://your-domain.example/api/webhooks/stream` and subscribe it to both `call.ring` and `message.new`. The handler verifies Stream's `X-Signature` with `STREAM_API_SECRET` before sending notifications.
4. Sign in on each browser/device and enable the bell in a conversation header. Allow browser notifications. The app creates and saves a Web Push subscription; use the adjacent ringing-bell button to send an end-to-end push test.
5. Test a call with the recipient's browser open in the background. The deployed webhook must be publicly reachable; localhost is not reachable by Stream.

The push-subscription API requires the VAPID key pair and stores each signed-in user's browser endpoints in MongoDB. Expired push endpoints are removed automatically. The default incoming-call chime repeats until the call is answered, declined, or ends; an uploaded custom ringtone plays once per incoming call. Sound preferences and uploaded files are saved in that browser; audio files must be smaller than 50 KB. The uploaded call sound is used while the page is running; closed-page push notifications use the sound and vibration behavior provided by the browser and operating system. Web Push does not let a website choose a custom notification sound while its page is closed. Push delivery while the browser is closed depends on browser and operating-system support; a fully stopped browser may not receive pushes.

On iPhone and iPad, install CommuniChat from Safari with **Share → Add to Home Screen**, then open it from its Home Screen icon and allow notifications. Web Push for Home Screen web apps requires iOS/iPadOS 16.4 or newer. Android users can allow notifications in a supported browser; browser settings must also allow CommuniChat notifications.

## Project layout

```text
app/
  api/stream/token/       Authenticated Stream token endpoint
  sign-in/                Clerk sign-in page
  sign-up/                Clerk sign-up page
  globals.css             Tailwind base and Stream theme
  layout.tsx              Root Clerk provider and metadata
  landing-page.tsx        Public marketing page
  page.tsx                Public landing page and authenticated workspace entry
components/
  chat-dashboard.tsx      Chat, conversation rail, and video-call UI
lib/
  mongodb.ts              Mongoose connection cache
  sync-user.ts            Clerk-to-MongoDB profile synchronization
models/
  Settings.ts             User preferences model
  User.ts                 Persistent user metadata model
proxy.ts                  Clerk route protection
```
