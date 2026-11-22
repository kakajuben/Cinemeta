import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Lock, Unlock, Copy, Video, VideoOff, Mic, MicOff, Send, X, LogOut, Crown } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Msg = { id: string; from: string; name: string; text: string };
type Peer = { id: string; name: string; host: boolean };
type Float = { id: string; emoji: string; left: number };

const EMOJIS = ["🍿", "🎬", "🔥", "😱", "😂", "💖", "🚀", "👏"];
const STICKERS = ["🤯", "😭", "🥶", "💀", "🫣", "🤩"];
const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }];

function rid(n = 16) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, n * 1.5);
}
const getVideo = () => document.querySelector<HTMLVideoElement>("video");

export function WatchParty({ titleId, onOpenPlayer }: { titleId: string; onOpenPlayer: () => void }) {
  const [room, setRoom] = useState<{ id: string; key: string } | null>(null);
  const [me] = useState(() => ({ id: "", name: "" }));
  const [isHost, setIsHost] = useState(false);
  const [locked, setLocked] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [floats, setFloats] = useState<Float[]>([]);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const chRef = useRef<RealtimeChannel | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const pcs = useRef<Record<string, RTCPeerConnection>>({});
  const remoteAction = useRef(false);
  const allowed = useRef<Set<string>>(new Set());
  const lockedRef = useRef(false);
  const hostRef = useRef(false);
  const localVid = useRef<HTMLVideoElement | null>(null);

  // read party link from URL
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get("party");
    const key = p.get("key");
    if (!me.id) {
      me.id = rid(8);
      me.name = localStorage.getItem("trybox:party-name") || `Guest-${me.id.slice(0, 4)}`;
    }
    if (id && key && /^[a-z0-9]{6,40}$/.test(id) && /^[a-z0-9]{10,40}$/.test(key)) {
      setRoom({ id, key });
      onOpenPlayer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    void chRef.current?.send({ type: "broadcast", event, payload: { ...payload, from: me.id } });
  }, [me]);

  const addFloat = (emoji: string) => {
    const f = { id: rid(6), emoji, left: 10 + Math.random() * 80 };
    setFloats((x) => [...x, f]);
    setTimeout(() => setFloats((x) => x.filter((y) => y.id !== f.id)), 3000);
  };

  const makePc = useCallback((peerId: string) => {
    pcs.current[peerId]?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pcs.current[peerId] = pc;
    localStream.current?.getTracks().forEach((t) => pc.addTrack(t, localStream.current!));
    pc.onicecandidate = (e) => e.candidate && send("rtc", { to: peerId, ice: e.candidate.toJSON() });
    pc.ontrack = (e) => { const s = e.streams[0]; if (s) setStreams((x) => ({ ...x, [peerId]: s })); };
    return pc;
  }, [send]);

  const callPeer = useCallback(async (peerId: string) => {
    const pc = makePc(peerId);
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    send("rtc", { to: peerId, sdp: offer });
  }, [makePc, send]);

  // join channel
  useEffect(() => {
    if (!room) return;
    const ch = supabase.channel(`wp:${titleId}:${room.id}:${room.key}`, {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });
    chRef.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState<{ name: string; host: boolean }>();
      const list: Peer[] = Object.entries(st).map(([id, v]) => ({ id, name: v[0]?.name ?? "Guest", host: !!v[0]?.host }));
      setPeers(list);
      if (hostRef.current) {
        for (const p of list) {
          if (p.id === me.id) continue;
          if (lockedRef.current && !allowed.current.has(p.id)) send("kick", { to: p.id });
          else allowed.current.add(p.id);
        }
      }
      if (!list.some((p) => p.host) && list[0]?.id === me.id) { hostRef.current = true; setIsHost(true); void ch.track({ name: me.name, host: true }); }
    });
    ch.on("presence", { event: "join" }, ({ key }) => {
      if (key !== me.id && hostRef.current) {
        const v = getVideo();
        if (v) setTimeout(() => send("sync", { t: v.currentTime, paused: v.paused }), 800);
        send("lock", { locked: lockedRef.current });
      }
      if (key !== me.id && localStream.current) void callPeer(key);
    });
    ch.on("presence", { event: "leave" }, ({ key }) => {
      pcs.current[key]?.close(); delete pcs.current[key];
      setStreams((x) => { const n = { ...x }; delete n[key]; return n; });
    });
    ch.on("broadcast", { event: "sync" }, ({ payload }) => {
      const v = getVideo(); if (!v) return;
      remoteAction.current = true;
      if (Math.abs(v.currentTime - payload.t) > 1.5) v.currentTime = payload.t;
      if (payload.paused && !v.paused) v.pause();
      if (!payload.paused && v.paused) void v.play().catch(() => undefined);
      if (payload.label) toast(`${payload.name} ${payload.label}`);
      setTimeout(() => (remoteAction.current = false), 400);
    });
    ch.on("broadcast", { event: "chat" }, ({ payload }) => setMsgs((m) => [...m.slice(-150), payload as Msg]));
    ch.on("broadcast", { event: "react" }, ({ payload }) => addFloat(payload.emoji));
    ch.on("broadcast", { event: "lock" }, ({ payload }) => { lockedRef.current = payload.locked; setLocked(payload.locked); });
    ch.on("broadcast", { event: "kick" }, ({ payload }) => {
      if (payload.to === me.id) { toast.error("The host removed you from this watch party"); leave(); }
    });
    ch.on("broadcast", { event: "mute" }, ({ payload }) => {
      if (payload.to === me.id) { localStream.current?.getAudioTracks().forEach((t) => (t.enabled = false)); setMicOn(false); toast("The host muted your mic"); }
    });
    ch.on("broadcast", { event: "host" }, ({ payload }) => {
      if (payload.to === me.id) { hostRef.current = true; setIsHost(true); void ch.track({ name: me.name, host: true }); toast.success("You are now the host"); }
    });
    ch.on("broadcast", { event: "rtc" }, async ({ payload }) => {
      if (payload.to !== me.id) return;
      let pc = pcs.current[payload.from];
      if (payload.sdp?.type === "offer") {
        pc = makePc(payload.from);
        await pc.setRemoteDescription(payload.sdp);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        send("rtc", { to: payload.from, sdp: ans });
      } else if (payload.sdp?.type === "answer" && pc) await pc.setRemoteDescription(payload.sdp);
      else if (payload.ice && pc) await pc.addIceCandidate(payload.ice).catch(() => undefined);
    });

    ch.subscribe(async (s) => {
      if (s === "SUBSCRIBED") await ch.track({ name: me.name, host: hostRef.current });
    });

    // playback sync from my player
    const attach = setInterval(() => {
      const v = getVideo(); if (!v || (v as unknown as { _wp?: boolean })._wp) return;
      (v as unknown as { _wp?: boolean })._wp = true;
      const push = (label: string) => () => {
        if (remoteAction.current) return;
        send("sync", { t: v.currentTime, paused: v.paused, label, name: me.name });
      };
      v.addEventListener("play", push("pressed play"));
      v.addEventListener("pause", push("paused"));
      v.addEventListener("seeked", push("jumped ahead"));
    }, 1000);
    const drift = setInterval(() => {
      const v = getVideo();
      if (hostRef.current && v && !v.paused) send("sync", { t: v.currentTime, paused: false });
    }, 5000);

    return () => {
      clearInterval(attach); clearInterval(drift);
      Object.values(pcs.current).forEach((p) => p.close()); pcs.current = {};
      void supabase.removeChannel(ch); chRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const start = () => {
    const r = { id: rid(8), key: rid(14) };
    hostRef.current = true; setIsHost(true);
    const url = new URL(window.location.href);
    url.searchParams.set("party", r.id); url.searchParams.set("key", r.key);
    window.history.replaceState(null, "", url.toString());
    setRoom(r); onOpenPlayer();
    void navigator.clipboard?.writeText(url.toString()).then(() => toast.success("Private party link copied — send it to your friend"));
  };

  function leave() {
    localStream.current?.getTracks().forEach((t) => t.stop()); localStream.current = null;
    setCamOn(false); setMicOn(false); setStreams({}); setRoom(null); setMsgs([]); setPeers([]);
    hostRef.current = false; setIsHost(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("party"); url.searchParams.delete("key");
    window.history.replaceState(null, "", url.toString());
  }

  const toggleMedia = async (kind: "video" | "audio") => {
    try {
      if (!localStream.current) {
        localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.current.getVideoTracks().forEach((t) => (t.enabled = kind === "video"));
        localStream.current.getAudioTracks().forEach((t) => (t.enabled = kind === "audio"));
        if (localVid.current) localVid.current.srcObject = localStream.current;
        setCamOn(kind === "video"); setMicOn(kind === "audio");
        peers.filter((p) => p.id !== me.id).forEach((p) => void callPeer(p.id));
        return;
      }
      const tracks = kind === "video" ? localStream.current.getVideoTracks() : localStream.current.getAudioTracks();
      const on = !tracks[0]?.enabled;
      tracks.forEach((t) => (t.enabled = on));
      if (kind === "video") setCamOn(on); else setMicOn(on);
    } catch {
      toast.error("Allow camera and microphone in your browser to join the call");
    }
  };

  useEffect(() => { if (localVid.current && localStream.current) localVid.current.srcObject = localStream.current; }, [camOn]);

  const sendChat = (t: string) => {
    const v = t.trim().slice(0, 500); if (!v) return;
    const m: Msg = { id: rid(6), from: me.id, name: me.name, text: v };
    setMsgs((x) => [...x, m]); send("chat", m); setText("");
  };
  const react = (e: string) => { addFloat(e); send("react", { emoji: e }); };
  const toggleLock = () => {
    const n = !locked; lockedRef.current = n; setLocked(n);
    peers.forEach((p) => allowed.current.add(p.id));
    send("lock", { locked: n });
    toast(n ? "Room locked — nobody new can join" : "Room unlocked");
  };

  if (!room) {
    return (
      <button onClick={start} className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-5 py-2.5 text-sm font-semibold text-foreground backdrop-blur-xl transition hover:bg-primary/25">
        <Users className="h-4 w-4" /> 🎉 Start Watch Party
      </button>
    );
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
        {floats.map((f) => (
          <span key={f.id} className="absolute bottom-10 text-4xl animate-[wpfloat_3s_ease-out_forwards]" style={{ left: `${f.left}%` }}>{f.emoji}</span>
        ))}
      </div>
      <style>{`@keyframes wpfloat{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:1}100%{transform:translateY(-70vh) scale(1.3);opacity:0}}`}</style>

      <section className="mt-6 rounded-3xl border border-border bg-card/60 p-4 backdrop-blur-2xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> Watch Party · {peers.length} watching</span>
          {isHost && <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs"><Crown className="h-3 w-3" /> Host</span>}
          {locked && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs"><Lock className="h-3 w-3" /> Locked</span>}
          <div className="ml-auto flex flex-wrap gap-2">
            <button onClick={() => void navigator.clipboard?.writeText(window.location.href).then(() => toast.success("Private link copied"))} className="rounded-full border border-border px-3 py-1.5 text-xs inline-flex items-center gap-1"><Copy className="h-3 w-3" /> Copy link</button>
            {isHost && <button onClick={toggleLock} className="rounded-full border border-border px-3 py-1.5 text-xs inline-flex items-center gap-1">{locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{locked ? "Unlock" : "Lock room"}</button>}
            <button onClick={() => void toggleMedia("video")} className="rounded-full border border-border px-3 py-1.5 text-xs inline-flex items-center gap-1">{camOn ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />} Camera</button>
            <button onClick={() => void toggleMedia("audio")} className="rounded-full border border-border px-3 py-1.5 text-xs inline-flex items-center gap-1">{micOn ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />} Mic</button>
            <button onClick={leave} className="rounded-full border border-destructive/50 px-3 py-1.5 text-xs inline-flex items-center gap-1 text-destructive"><LogOut className="h-3 w-3" /> Leave</button>
          </div>
        </div>

        {(camOn || Object.keys(streams).length > 0) && (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {camOn && <video ref={localVid} autoPlay muted playsInline className="h-28 w-40 shrink-0 rounded-xl border border-primary/50 object-cover" />}
            {Object.entries(streams).map(([id, s]) => (
              <video key={id} autoPlay playsInline ref={(el) => { if (el && el.srcObject !== s) el.srcObject = s; }} className="h-28 w-40 shrink-0 rounded-xl border border-border object-cover" />
            ))}
          </div>
        )}

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_200px]">
          <div>
            <div className="h-48 overflow-y-auto rounded-2xl bg-background/50 p-3 text-sm space-y-1.5">
              {msgs.length === 0 && <p className="text-muted-foreground text-xs">Say hi 👋 — messages are only seen by people with this private link.</p>}
              {msgs.map((m) => (
                <p key={m.id} className={/^\p{Extended_Pictographic}+$/u.test(m.text) ? "text-3xl" : ""}><b className="text-primary">{m.from === me.id ? "You" : m.name}:</b> {m.text}</p>
              ))}
            </div>
            <div className="mt-2 flex gap-1 flex-wrap">
              {EMOJIS.map((e) => <button key={e} onClick={() => react(e)} className="rounded-full bg-background/60 px-2 py-1 text-lg hover:scale-110 transition">{e}</button>)}
              <span className="mx-1 w-px bg-border" />
              {STICKERS.map((e) => <button key={e} onClick={() => sendChat(e)} className="rounded-full bg-background/60 px-2 py-1 text-lg hover:scale-110 transition">{e}</button>)}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); sendChat(text); }} className="mt-2 flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Message your friends…" className="flex-1 rounded-full border border-border bg-background/60 px-4 py-2 text-sm outline-none" />
              <button className="rounded-full bg-primary px-4 text-primary-foreground"><Send className="h-4 w-4" /></button>
            </form>
          </div>
          <ul className="space-y-1 text-sm">
            {peers.map((p) => (
              <li key={p.id} className="flex items-center gap-1 rounded-xl bg-background/40 px-2 py-1">
                {p.host && <Crown className="h-3 w-3 text-primary" />}
                <span className="truncate flex-1">{p.id === me.id ? `${p.name} (you)` : p.name}</span>
                {isHost && p.id !== me.id && (
                  <>
                    <button title="Mute" onClick={() => send("mute", { to: p.id })}><MicOff className="h-3 w-3" /></button>
                    <button title="Make host" onClick={() => { send("host", { to: p.id }); hostRef.current = false; setIsHost(false); void chRef.current?.track({ name: me.name, host: false }); }}><Crown className="h-3 w-3" /></button>
                    <button title="Remove" onClick={() => { allowed.current.delete(p.id); send("kick", { to: p.id }); }}><X className="h-3 w-3" /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
