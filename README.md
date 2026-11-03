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

The authenticated `/api/stream/token` route provisions the signed-in user in Stream and upserts their MongoDB profile/settings. When someone opens Communichat, the authenticated profile-sync request also refreshes the latest Clerk names and photos for members of their recent chats in Stream. This avoids requiring a Clerk webhook; profile changes sync the next time a chat member opens Communichat.

## Included features

- Clerk sign-in/sign-up and protected workspace routes
- User and settings Mongoose models, with idempotent profile synchronization
- Server-issued Stream user tokens; the Stream secret is never sent to the browser
- Real-time Stream messaging with channel lists, direct messages, group channels, media uploads, typing indicators, read receipts, and threaded replies
- GIF search and sending through Stream's built-in `/giphy` command, with no separate Giphy API key
- Stream Video calling overlay with microphone, camera, screen-share, and leave controls
- Ringing call invitations that recipients can accept or decline, with incoming video requested at up to 720p when network conditions allow
- Recipients who open Communichat while a call is still active can find and join that call
- Optional in-page sound for incoming calls while Communichat is open
- Responsive dashboard layout and dark theme

Create a direct message or group channel from the **+** button in the conversation rail. Use the **GIF** button next to the composer to search and send a GIF (leave the search empty for a random GIF); Stream's Giphy command must be enabled for the channel type in the Stream dashboard. Call buttons invite members of the selected conversation; recipients can join or decline from the incoming call prompt. Each invite creates a new Stream call and sends the ring event with the call request. Video resolution is adaptive, so network conditions and camera hardware may result in a lower resolution. Stream's channel permissions and upload settings are managed in the Stream dashboard. For a production deployment, configure Clerk's allowed origins and Stream's production permissions.

Incoming-call sound is optional and plays only while Communichat is open. Enable it with the speaker button in a conversation header; browsers require this interaction before they allow audio playback.

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
