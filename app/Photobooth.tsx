"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Filter = { name: string; icon: string; css: string };
type Signal = { type: string; room?: string; from?: string; payload?: any; startsAt?: number };

const FILTERS: Filter[] = [
  { name: "Normal", icon: "✦", css: "none" },
  { name: "B&W", icon: "◐", css: "grayscale(1)" },
  { name: "Warm", icon: "☀", css: "sepia(.22) saturate(1.25) hue-rotate(-8deg)" },
  { name: "Cool", icon: "❄", css: "saturate(.9) hue-rotate(18deg) brightness(1.04)" },
  { name: "Vintage", icon: "◎", css: "sepia(.38) contrast(.9) saturate(.8) brightness(1.06)" },
  { name: "Sepia", icon: "♨", css: "sepia(.85) contrast(.92)" },
  { name: "Dreamy", icon: "☁", css: "brightness(1.12) contrast(.82) saturate(.9) blur(.6px)" },
  { name: "Contrast", icon: "◒", css: "contrast(1.38) saturate(1.08)" },
  { name: "Soft pink", icon: "♥", css: "sepia(.16) saturate(1.2) hue-rotate(305deg) brightness(1.08)" },
  { name: "Film", icon: "▦", css: "contrast(1.16) saturate(.78) sepia(.14)" },
  { name: "Golden", icon: "✺", css: "sepia(.3) saturate(1.38) brightness(1.04)" },
  { name: "Fade", icon: "◌", css: "contrast(.78) saturate(.72) brightness(1.12)" },
];

const makeRoom = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function Photobooth() {
  const [room, setRoom] = useState("");
  const [inputRoom, setInputRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("Waiting for you");
  const [layout, setLayout] = useState<"strip" | "single">("strip");
  const [filter, setFilter] = useState(FILTERS[0]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [taking, setTaking] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [muted, setMuted] = useState(true);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const clientId = useRef(Math.random().toString(36).slice(2));
  const roomRef = useRef("");
  const captureRef = useRef<() => void>(() => {});
  const required = layout === "strip" ? 4 : 1;
  const signalingUrl = process.env.NEXT_PUBLIC_SIGNAL_URL;

  const send = useCallback((message: Signal) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(
  JSON.stringify({
    ...message,
    room: roomRef.current,
    from: clientId.current,
  }),
);
    }
  }, [room]);

  const startCountdown = useCallback(async (startsAt = Date.now() + 350) => {
    if (taking) return;
    setTaking(true);
    const delay = Math.max(0, startsAt - Date.now());
    if (delay) await wait(delay);
    for (let n = 3; n > 0; n--) {
      setCountdown(n);
      await wait(1000);
    }
    setCountdown(0);
    await wait(180);
    captureRef.current();
    setCountdown(null);
    setTaking(false);
  }, [taking]);

  const setupPeer = useCallback(async (initiator: boolean) => {
    if (!localStream.current || peer.current) return;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peer.current = pc;
    localStream.current.getTracks().forEach((track) => pc.addTrack(track, localStream.current!));
    pc.ontrack = (event) => {
      if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0];
      setStatus("Both of you are here ♥");
    };
    pc.onicecandidate = (event) => event.candidate && send({ type: "ice", payload: event.candidate });
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "offer", payload: offer });
    }
  }, [send]);

  const connectRoom = useCallback((code: string) => {
    if (!signalingUrl) {
      if (remoteVideo.current) remoteVideo.current.srcObject = localStream.current;
      setStatus("Demo partner connected ♥");
      return;
    }
    const ws = new WebSocket(signalingUrl);
    socket.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "join", room: code, from: clientId.current }));
    ws.onmessage = async ({ data }) => {
      const msg: Signal = JSON.parse(data);
      if (msg.from === clientId.current) return;
      if (msg.type === "peer-ready") await setupPeer(true);
      if (msg.type === "offer") {
        await setupPeer(false);
        await peer.current!.setRemoteDescription(msg.payload);
        const answer = await peer.current!.createAnswer();
        await peer.current!.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", room: code, from: clientId.current, payload: answer }));
      }
      if (msg.type === "answer") await peer.current?.setRemoteDescription(msg.payload);
      if (msg.type === "ice" && msg.payload) await peer.current?.addIceCandidate(msg.payload);
      if (msg.type === "capture" && msg.startsAt) startCountdown(msg.startsAt);
      if (msg.type === "peer-left") setStatus("Your person stepped away");
    };
    ws.onerror = () => setStatus("Couldn’t reach the room server");
  }, [signalingUrl, setupPeer, startCountdown]);

  const join = async (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
      localStream.current = stream;
      roomRef.current = clean;
      setRoom(clean);
      setJoined(true);
      setStatus(signalingUrl ? "Waiting for your person…" : "Starting demo room…");
      setTimeout(() => {
        if (localVideo.current) localVideo.current.srcObject = stream;
        connectRoom(clean);
}, 500);
    } catch {
      setStatus("Camera permission is needed to enter");
    }
  };

  const capture = useCallback(() => {
    const left = localVideo.current;
    const right = remoteVideo.current;
    if (!left || !right || left.readyState < 2 || right.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f8ebe8";
    ctx.fillRect(0, 0, 1200, 800);
    ctx.filter = filter.css;
    const drawCover = (video: HTMLVideoElement, x: number) => {
      const sourceRatio = video.videoWidth / video.videoHeight;
      const targetRatio = 600 / 800;
      let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
      if (sourceRatio > targetRatio) { sw = video.videoHeight * targetRatio; sx = (video.videoWidth - sw) / 2; }
      else { sh = video.videoWidth / targetRatio; sy = (video.videoHeight - sh) / 2; }
      ctx.save();
      ctx.translate(x + 600, 0); ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 600, 800);
      ctx.restore();
    };
    drawCover(left, 0); drawCover(right, 600);
    ctx.filter = "none";
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(586, 0, 28, 800);
    const next = [...photos, canvas.toDataURL("image/jpeg", .94)].slice(0, required);
    setPhotos(next);
    if (next.length === required) setTimeout(() => setShowResult(true), 350);
  }, [filter, photos, required]);

  useEffect(() => { captureRef.current = capture; }, [capture]);
  useEffect(() => () => {
    localStream.current?.getTracks().forEach((track) => track.stop());
    peer.current?.close(); socket.current?.close();
  }, []);

  const triggerCapture = () => {
    const startsAt = Date.now() + 600;
    send({ type: "capture", startsAt });
    startCountdown(startsAt);
  };

  const compose = async () => {
    const single = layout === "single";
    const width = single ? 1200 : 720;
    const imageH = single ? 800 : 480;
    const margin = single ? 34 : 30;
    const footer = single ? 74 : 88;
    const height = margin + photos.length * imageH + (photos.length - 1) * 18 + footer;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff9f6"; ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < photos.length; i++) {
      const img = new Image(); img.src = photos[i]; await img.decode();
      const y = margin + i * (imageH + 18);
      ctx.drawImage(img, 0, 0, img.width, img.height, margin, y, width - margin * 2, imageH);
    }
    ctx.fillStyle = "#754b50";
    ctx.font = single ? "600 24px Arial" : "600 19px Arial";
    ctx.textAlign = "left"; ctx.fillText("together, wherever ♥", margin, height - 30);
    ctx.textAlign = "right"; ctx.font = single ? "20px Arial" : "17px Arial";
    ctx.fillText(new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date()), width - margin, height - 30);
    return canvas;
  };

  const download = async () => {
    const canvas = await compose();
    const link = document.createElement("a");
    link.download = `sweetframe-${room}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png"); link.click();
  };

  const restart = () => { setPhotos([]); setShowResult(false); };

  if (!joined) return (
    <main className="landing-shell">
      <header className="topbar"><Logo /><span className="privacy-pill"><i /> Private peer-to-peer</span></header>
      <section className="hero">
        <div className="eyebrow">A little closer, from anywhere</div>
        <h1>Your favorite person,<br /><em>in the same frame.</em></h1>
        <p>Step into a tiny photo booth together. No distance, just smiles.</p>
        <div className="join-card">
          <label htmlFor="room">Enter your room code</label>
          <div className="join-row">
            <input id="room" value={inputRoom} onChange={(e) => setInputRoom(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && join(inputRoom)} maxLength={12} placeholder="e.g. LOVE25" />
            <button onClick={() => join(inputRoom)}>Join booth <span>→</span></button>
          </div>
          <div className="card-separator"><span>or</span></div>
          <button className="new-room" onClick={() => { const code = makeRoom(); setInputRoom(code); join(code); }}>＋ Create a new room</button>
          <small>Share the code with your person. Camera access is requested after you join.</small>
        </div>
        <div className="trust-row"><span>♡ No account needed</span><span>♙ Your photos stay on your device</span><span>◉ Works best in Chrome or Edge</span></div>
      </section>
      <div className="decor decor-one">♥</div><div className="decor decor-two">✦</div><div className="decor decor-three">♡</div>
    </main>
  );

  return (
    <main className="app-shell">
      <header className="app-topbar"><Logo /><div className="room-badge"><span>Room</span><b>{room}</b><button aria-label="Copy room code" onClick={() => navigator.clipboard.writeText(room)}>▢</button></div><div className="live-status"><i /> {status}</div></header>
      <div className="workspace">
        <section className="booth-panel">
          <div className="video-stage" style={{ filter: filter.css }}>
            <div className="video-wrap"><video ref={localVideo} autoPlay playsInline muted /><span className="name-tag">You</span></div>
            <div className="heart-seam">♥</div>
            <div className="video-wrap"><video ref={remoteVideo} autoPlay playsInline muted={muted} /><span className="name-tag">Your person</span></div>
            {countdown !== null && <div className="countdown">{countdown || "♡"}</div>}
          </div>
          <div className="camera-tools">
            <button onClick={() => { const track = localStream.current?.getVideoTracks()[0]; if (track) track.enabled = !track.enabled; }}>◉ <span>Camera</span></button>
            <button className="capture-button" disabled={taking || photos.length >= required} onClick={triggerCapture}><span>●</span> {photos.length >= required ? "All done" : `Take photo ${photos.length + 1}/${required}`}</button>
            <button onClick={() => setMuted(!muted)}>{muted ? "⌁" : "))"} <span>{muted ? "Unmute" : "Mute"}</span></button>
          </div>
          <p className="capture-note">The countdown starts for both of you at the same time.</p>
          <div className="session-progress">
            {Array.from({ length: required }).map((_, i) => <button key={i} className={photos[i] ? "shot filled" : "shot"} onClick={() => photos[i] && setPhotos(photos.filter((_, j) => j !== i))}>{photos[i] ? <img src={photos[i]} alt={`Photo ${i + 1}`} /> : <span>{i + 1}</span>}</button>)}
          </div>
        </section>
        <aside className="control-panel">
          <div className="control-section"><div className="section-title"><span>1</span><div><b>Choose your layout</b><small>How should your keepsake look?</small></div></div>
            <div className="layout-grid"><button className={layout === "strip" ? "active" : ""} onClick={() => { setLayout("strip"); restart(); }}><i className="strip-icon">▰<br />▰<br />▰<br />▰</i><b>Classic strip</b><small>4 moments</small></button><button className={layout === "single" ? "active" : ""} onClick={() => { setLayout("single"); restart(); }}><i className="single-icon">▰</i><b>One big frame</b><small>1 moment</small></button></div>
          </div>
          <div className="control-section filter-section"><div className="section-title"><span>2</span><div><b>Pick a feeling</b><small>Applied to both cameras</small></div></div>
            <div className="filter-grid">{FILTERS.map((item) => <button key={item.name} className={filter.name === item.name ? "active" : ""} onClick={() => setFilter(item)}><i style={{ filter: item.css }}>{item.icon}</i><span>{item.name}</span></button>)}</div>
          </div>
          <div className="tip-card">✦ <div><b>Little tip</b><p>Look at your camera, not the screen, for that “together” feeling.</p></div></div>
          <button className="restart-link" onClick={restart}>↻ Restart this session</button>
        </aside>
      </div>
      {showResult && <div className="modal-backdrop"><div className="result-modal"><button className="modal-close" onClick={() => setShowResult(false)}>×</button><span className="result-kicker">Your moment is ready</span><h2>Together looks good on you.</h2><div className={`result-preview ${layout}`}>{photos.map((photo, i) => <div key={i}><img src={photo} alt={`Captured moment ${i + 1}`} /><button onClick={() => { setPhotos(photos.filter((_, j) => j !== i)); setShowResult(false); }}>Retake</button></div>)}<footer><b>together, wherever ♥</b><span>{new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date())}</span></footer></div><div className="result-actions"><button className="secondary" onClick={() => setShowResult(false)}>← Back to booth</button><button className="download" onClick={download}>↓ Download PNG</button></div><button className="restart-link" onClick={restart}>Start a new set</button></div></div>}
    </main>
  );
}

function Logo() { return <div className="logo"><span>♥</span><b>Sweetframe</b><small>virtual photo booth</small></div>; }
