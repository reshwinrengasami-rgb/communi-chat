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
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key from the Web Push VAPID key pair |
| `VAPID_PRIVATE_KEY` | Private key from the Web Push VAPID key pair; server-side only |
| `VAPID_SUBJECT` | Contact URI for the push sender, e.g. `mailto:admin@example.com` |

The authenticated `/api/stream/token` route provisions the signed-in user in Stream and upserts their MongoDB profile/settings when they open Communichat. No Clerk webhook setup is required.

## Included features

- Clerk sign-in/sign-up and protected workspace routes
- User and settings Mongoose models, with idempotent profile synchronization
- Server-issued Stream user tokens; the Stream secret is never sent to the browser
- Real-time Stream messaging with channel lists, direct messages, group channels, media uploads, typing indicators, read receipts, and threaded replies
- GIF search and sending through Stream's built-in `/giphy` command, with no separate Giphy API key
- Stream Video calling overlay with microphone, camera, screen-share, and leave controls
- Ringing call invitations that recipients can accept or decline, with incoming video requested at up to 720p when network conditions allow
- Opt-in browser push notifications for messages and incoming calls, plus an in-page chime for incoming calls
- Responsive dashboard layout and dark theme

Create a direct message or group channel from the **+** button in the conversation rail. Use the **GIF** button next to the composer to search and send a GIF (leave the search empty for a random GIF); Stream's Giphy command must be enabled for the channel type in the Stream dashboard. Call buttons invite members of the selected conversation; recipients can join or decline from the incoming call prompt. Each invite creates a new Stream call and sends the ring event with the call request. Video resolution is adaptive, so network conditions and camera hardware may result in a lower resolution. Stream's channel permissions and upload settings are managed in the Stream dashboard. For a production deployment, configure Clerk's allowed origins and Stream's production permissions.

### Background call notifications

1. Generate a VAPID key pair with `npx web-push generate-vapid-keys` and add the public key, private key, and a real contact URI to `.env.local` and your deployment environment. Keep the private key secret and use the same key pair for the public and private variables.
2. In the Stream dashboard, configure an HTTPS webhook pointing to `https://<your-domain>/api/webhooks/stream/video` and subscribe it to both `call.ring` and `message.new`. Configure this as an additional event hook without removing existing hooks.
3. Restart the local app or redeploy after setting the environment variables. Each user must sign in and select the bell in a conversation header to allow chat and call notifications. The browser must support Web Push and notification permission must be granted.

The app validates Stream webhook signatures before sending pushes and stores subscriptions in MongoDB. New messages are sent to subscribed channel members other than the sender, unless their channel notifications are muted. While the page is suspended or closed, the service worker displays a system notification; whether that notification makes a sound, and what sound it uses, is controlled by the browser, operating system, and the user's notification settings. Web Push cannot guarantee a custom chime or override silent mode, Do Not Disturb, or disabled notifications.

## Project layout

```text
app/
  api/stream/token/       Authenticated Stream token endpoint
  sign-in/                Clerk sign-in page
  sign-up/                Clerk sign-up page
  globals.css             Tailwind base and Stream theme
  layout.tsx              Root Clerk provider and metadata
  page.tsx                Authenticated workspace entry
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
