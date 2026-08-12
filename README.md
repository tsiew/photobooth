# Sweetframe virtual photo booth

A beginner-friendly virtual photo booth for long-distance couples. It includes two live camera panels, a shared countdown, 12 filters, a four-photo strip, a large single frame, individual retakes, a date stamp, and PNG download.

## Try it on one computer (demo mode)

1. Install Node.js 22 or newer from https://nodejs.org.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open `http://localhost:3000`, create a room, and allow camera access.

Demo mode intentionally mirrors your camera into the second panel. This lets every feature work without a server.

## Use two real devices

WebRTC sends the camera/audio directly between the two browsers, but the browsers still need a tiny **signaling server** to introduce them and exchange connection details. The included server never receives or stores photos.

### Local network setup

1. Copy `.env.example` to a new file named `.env.local`.
2. Run `npm install` once.
3. In one terminal, run `npm run signal`.
4. In another terminal, run `npm run dev`.
5. For a second device on the same Wi-Fi, replace `localhost` in `.env.local` with the first computer's local IP address. Restart `npm run dev` after changing it.
6. Open the website on both devices, enter the same room code, and allow camera and microphone access.

Browsers require HTTPS for camera access except on `localhost`. For phones or devices across the internet, deploy both the website and signaling server with HTTPS/WSS.

### Simple internet deployment

- Deploy this web folder to a provider such as Vercel, Cloudflare, or Netlify.
- Deploy `signaling-server/server.mjs` to any Node.js host that supports WebSockets (Render, Railway, Fly.io, etc.). Set its start command to `npm run signal`.
- Set `NEXT_PUBLIC_SIGNAL_URL` on the website host to the secure WebSocket address, for example `wss://your-signal-service.example.com`, then redeploy.

Firebase or Supabase Realtime can replace the tiny WebSocket server by storing/relaying WebRTC offer, answer, ICE, and capture messages under a room code. The browser-side peer connection and photo features can stay the same.

## Privacy notes

- Photos are composed in each browser and downloaded locally; they are not uploaded.
- WebRTC media is peer-to-peer whenever the network permits it.
- The included setup uses Google's public STUN server. Difficult corporate/mobile networks may also require a TURN server for reliable connections.
- Room codes are convenient meeting codes, not passwords. Add authentication before using this for sensitive sessions.
