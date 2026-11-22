import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  Palette,
  Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize,
  PictureInPicture2, Subtitles, Languages, Gauge, SkipForward, Keyboard, Loader2,
} from "lucide-react";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(sec).padStart(2, "0")}`;
};

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  audioTracks: { index: number; label: string }[];
  activeTrack: number;
  onSelectAudio: (i: number) => void;
  onTogglePip: () => void;
  isSeries: boolean;
  onNextEpisode?: (() => void) | undefined;
};

type Menu = null | "speed" | "audio" | "subs" | "help" | "color";

const COLOR_PRESETS: { name: string; f: string }[] = [
  { name: "Normal", f: "" },
  { name: "Vivid", f: "contrast(1.15) saturate(1.35) brightness(1.02)" },
  { name: "High Contrast", f: "contrast(1.3) brightness(0.98)" },
  { name: "OLED Deep Black", f: "contrast(1.25) brightness(0.92) saturate(1.1)" },
  { name: "Ultra Clear", f: "contrast(1.1) saturate(1.15) brightness(1.05)" },
  { name: "Cinema Warm", f: "sepia(0.15) saturate(1.15) contrast(1.05)" },
  { name: "Arctic Cool", f: "hue-rotate(-12deg) saturate(0.95) brightness(1.03)" },
];
const HOLD_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4];

export function GlassControls({ videoRef, containerRef, audioTracks, activeTrack, onSelectAudio, onTogglePip, isSeries, onNextEpisode }: Props) {
  const [visible, setVisible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [menu, setMenu] = useState<Menu>(null);
  const [fs, setFs] = useState(false);
  const [quality, setQuality] = useState("Auto");
  const [subs, setSubs] = useState<{ i: number; label: string }[]>([]);
  const [activeSub, setActiveSub] = useState(-1);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(1);
  const [color, setColor] = useState(0);
  const [netSpeed, setNetSpeed] = useState<string | null>(null);
  const [showNet, setShowNet] = useState(false);
  const [hold, setHold] = useState<number | null>(null);
  const holdRef = useRef<{ t: number; x: number; prev: number; on: boolean } | null>(null);
  const holdT = useRef<number | undefined>(undefined);
  const suppressClick = useRef(false);
  const hideT = useRef<number | undefined>(undefined);
  const flashT = useRef<number | undefined>(undefined);
  const lastTap = useRef(0);
  const swipe = useRef<{ x: number; y: number; side: "l" | "r"; start: number; moved: boolean } | null>(null);

  const v = () => videoRef.current;

  const show = useCallback(() => {
    setVisible(true);
    window.clearTimeout(hideT.current);
    hideT.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) { setVisible(false); setMenu(null); }
    }, 3000);
  }, [videoRef]);

  const showFlash = (txt: string) => {
    setFlash(txt);
    window.clearTimeout(flashT.current);
    flashT.current = window.setTimeout(() => setFlash(null), 700);
  };

  const seek = (d: number) => { const el = v(); if (!el) return; el.currentTime = Math.max(0, Math.min((el.duration || 0), el.currentTime + d)); showFlash(`${d > 0 ? "+" : ""}${d}s`); show(); };
  const togglePlay = () => { const el = v(); if (!el) return; el.paused ? void el.play().catch(() => {}) : el.pause(); show(); };
  const setRate = (r: number) => {
    const el = v(); const n = Math.round(Math.max(0.25, Math.min(3, r)) * 100) / 100;
    if (el) el.playbackRate = n; setSpeed(n);
    try { localStorage.setItem("kino_speed", String(n)); } catch {}
    showFlash(`${n}x`);
  };
  const toggleFs = () => {
    const c = containerRef.current; if (!c) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void c.requestFullscreen?.().catch(() => v()?.requestFullscreen?.());
  };
  const selectSub = (i: number) => {
    const el = v(); if (!el) return;
    for (let k = 0; k < el.textTracks.length; k++) (el.textTracks[k] as TextTrack).mode = k === i ? "showing" : "disabled";
    setActiveSub(i);
    try { localStorage.setItem("kino_sub", i >= 0 ? (el.textTracks[i]?.language || el.textTracks[i]?.label || "") : "off"); } catch {}
  };

  // Wire video events
  useEffect(() => {
    const el = v(); if (!el) return;
    try { const s = Number(localStorage.getItem("kino_speed")); if (s > 0) { el.playbackRate = s; setSpeed(s); } } catch {}
    const upd = () => {
      setTime(el.currentTime); setDur(el.duration || 0);
      try { if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1)); } catch {}
    };
    const onPlay = () => { setPlaying(true); show(); };
    const onPause = () => { setPlaying(false); setVisible(true); };
    const onVol = () => { setMuted(el.muted); setVolume(el.volume); };
    const onMeta = () => {
      upd();
      if (el.videoHeight) setQuality(el.videoHeight >= 2000 ? "4K" : el.videoHeight >= 1000 ? "1080p" : el.videoHeight >= 700 ? "720p" : `${el.videoHeight}p`);
      const list: { i: number; label: string }[] = [];
      for (let k = 0; k < el.textTracks.length; k++) list.push({ i: k, label: el.textTracks[k]?.label || el.textTracks[k]?.language || `Track ${k + 1}` });
      setSubs(list);
      let pref = ""; try { pref = localStorage.getItem("kino_sub") || ""; } catch {}
      const idx = pref === "off" ? -1 : list.findIndex((t) => el.textTracks[t.i]?.language === pref || t.label === pref);
      if (pref) selectSub(idx);
      else for (let k = 0; k < el.textTracks.length; k++) if (el.textTracks[k]?.mode === "showing") setActiveSub(k);
    };
    const onWait = () => setWaiting(true);
    const onGo = () => setWaiting(false);
    const evs: [string, () => void][] = [["timeupdate", upd], ["progress", upd], ["play", onPlay], ["pause", onPause], ["volumechange", onVol], ["loadedmetadata", onMeta], ["resize", onMeta], ["waiting", onWait], ["stalled", onWait], ["playing", onGo], ["canplay", onGo], ["seeked", onGo]];
    evs.forEach(([n, f]) => el.addEventListener(n, f));
    el.textTracks.addEventListener?.("addtrack", onMeta);
    setPlaying(!el.paused);
    return () => { evs.forEach(([n, f]) => el.removeEventListener(n, f)); el.textTracks.removeEventListener?.("addtrack", onMeta); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef.current]);

  useEffect(() => {
    const f = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      const el = v(); if (!el) return;
      const k = e.key;
      const handled = () => { e.preventDefault(); show(); };
      if (k === " " || k.toLowerCase() === "k") { handled(); togglePlay(); }
      else if (k === "ArrowRight" && e.shiftKey) { handled(); seek(30); }
      else if (k === "ArrowLeft" && e.shiftKey) { handled(); seek(-30); }
      else if (k === "ArrowRight" || k.toLowerCase() === "l") { handled(); seek(10); }
      else if (k === "ArrowLeft" || k.toLowerCase() === "j") { handled(); seek(-10); }
      else if (k === "ArrowUp") { handled(); el.volume = Math.min(1, el.volume + 0.1); el.muted = false; showFlash(`Volume ${Math.round(el.volume * 100)}%`); }
      else if (k === "ArrowDown") { handled(); el.volume = Math.max(0, el.volume - 0.1); showFlash(`Volume ${Math.round(el.volume * 100)}%`); }
      else if (k.toLowerCase() === "s") { handled(); seek(85); }
      else if (k.toLowerCase() === "m") { handled(); el.muted = !el.muted; }
      else if (k.toLowerCase() === "f") { handled(); toggleFs(); }
      else if (k.toLowerCase() === "p") { handled(); onTogglePip(); }
      else if (k.toLowerCase() === "c") { handled(); if (subs.length) selectSub(activeSub >= 0 ? -1 : 0); }
      else if (k === ">" || k === ".") { if (k === ">") { handled(); setRate(el.playbackRate + 0.25); } }
      else if (k === "<" || k === ",") { if (k === "<") { handled(); setRate(el.playbackRate - 0.25); } }
      else if (k === "?") { handled(); setMenu((m) => (m === "help" ? null : "help")); }
      else if (k === "Escape" && menu) { setMenu(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Touch: tap toggles, double tap skips, vertical swipe brightness (left) / volume (right)
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0]; if (!t) return; const r = e.currentTarget.getBoundingClientRect();
    const side = t.clientX < r.left + r.width / 2 ? "l" : "r";
    swipe.current = { x: t.clientX, y: t.clientY, side, start: side === "l" ? brightness : (v()?.volume ?? 1), moved: false };
    holdStart(t.clientX);
  };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const s = swipe.current; if (!s) return;
    const t = e.touches[0]; if (!t) return; const dy = s.y - t.clientY;
    if (holdRef.current?.on) { holdMove(t.clientX); return; }
    if (Math.abs(dy) > 10 || Math.abs(t.clientX - s.x) > 10) window.clearTimeout(holdT.current);
    if (!s.moved && Math.abs(dy) < 18) return;
    if (!s.moved && Math.abs(t.clientX - s.x) > Math.abs(dy)) { swipe.current = null; return; }
    s.moved = true;
    const h = e.currentTarget.getBoundingClientRect().height;
    const val = Math.max(0, Math.min(s.side === "l" ? 1.5 : 1, s.start + dy / h));
    if (s.side === "l") { const b = Math.max(0.3, val); setBrightness(b); showFlash(`Brightness ${Math.round(b * 100)}%`); }
    else { const el = v(); if (el) { el.volume = val; el.muted = false; } showFlash(`Volume ${Math.round(val * 100)}%`); }
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const s = swipe.current; swipe.current = null;
    if (holdEnd()) { e.preventDefault(); return; }
    if (s?.moved) return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastTap.current < 300 && s) { seek(s.side === "r" ? 10 : -10); lastTap.current = 0; return; }
    lastTap.current = now;
    window.setTimeout(() => { if (lastTap.current === now) { visible ? setVisible(false) : show(); setMenu(null); } }, 300);
  };

  useEffect(() => { const el = v(); if (el) el.style.filter = [brightness === 1 ? "" : `brightness(${brightness})`, COLOR_PRESETS[color]?.f ?? ""].join(" ").trim(); }, [brightness, color, videoRef]);
  useEffect(() => { try { setColor(Number(localStorage.getItem("kino_color_preset")) || 0); setShowNet(localStorage.getItem("kino_show_net_speed") === "1"); } catch {} }, []);
  const pickColor = (i: number) => { setColor(i); try { localStorage.setItem("kino_color_preset", String(i)); } catch {} };
  const toggleNet = () => setShowNet((x) => { try { localStorage.setItem("kino_show_net_speed", x ? "0" : "1"); } catch {} return !x; });

  // Live network speed (estimated from buffer growth × bitrate guess via resource timing)
  useEffect(() => {
    if (!showNet) return;
    let last = 0;
    const id = window.setInterval(() => {
      const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      let bytes = 0; for (const e of entries) bytes += e.transferSize || e.encodedBodySize || 0;
      const d = last ? bytes - last : 0; last = bytes; performance.clearResourceTimings?.(); last = 0;
      const bps = d > 0 ? d : bytes;
      setNetSpeed(bps >= 1048576 ? `${(bps / 1048576).toFixed(1)} MB/s` : `${Math.round(bps / 1024)} KB/s`);
    }, 1000);
    return () => window.clearInterval(id);
  }, [showNet]);

  // Screen wake lock while playing
  useEffect(() => {
    if (!playing || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { void lock?.release().catch(() => {}); };
  }, [playing]);

  // Press & hold for 2x (slide sideways to change speed)
  const holdStart = (x: number) => {
    const el = v(); if (!el || el.paused) return;
    holdRef.current = { t: Date.now(), x, prev: el.playbackRate, on: false };
    window.clearTimeout(holdT.current);
    holdT.current = window.setTimeout(() => { const h = holdRef.current; const e2 = v(); if (!h || !e2) return; h.on = true; e2.playbackRate = 2; setHold(2); }, 450);
  };
  const holdMove = (x: number) => {
    const h = holdRef.current; const el = v(); if (!h?.on || !el) return;
    const idx = Math.max(0, Math.min(HOLD_SPEEDS.length - 1, 4 + Math.round((x - h.x) / 40)));
    const sp = HOLD_SPEEDS[idx] ?? 2; el.playbackRate = sp; setHold(sp);
  };
  const holdEnd = () => {
    window.clearTimeout(holdT.current);
    const h = holdRef.current; holdRef.current = null;
    if (h?.on) { const el = v(); if (el) el.playbackRate = h.prev; setHold(null); return true; }
    return false;
  };

  const pct = dur ? (time / dur) * 100 : 0;
  const bufPct = dur ? (buffered / dur) * 100 : 0;
  const btn = "grid h-9 w-9 place-items-center rounded-full text-foreground/90 transition hover:bg-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const pop = "absolute bottom-14 right-0 z-40 min-w-44 rounded-xl border border-border/40 bg-background/80 p-2 shadow-2xl backdrop-blur-xl";
  const item = (on: boolean) => `block w-full rounded-lg px-3 py-1.5 text-left text-sm ${on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-foreground/10"}`;

  return (
    <div
      className={`absolute inset-0 z-20 select-none ${visible ? "cursor-default" : "cursor-none"}`}
      onMouseMove={show}
      onMouseLeave={() => playing && setVisible(false)}
    >
      {/* gesture / click layer */}
      <div
        className="absolute inset-0"
        onMouseDown={(e) => holdStart(e.clientX)}
        onMouseMove={(e) => holdMove(e.clientX)}
        onMouseUp={() => { if (holdEnd()) suppressClick.current = true; }}
        onClick={(e) => { if (suppressClick.current) { suppressClick.current = false; return; } if ((e.nativeEvent as PointerEvent).pointerType !== "touch") { togglePlay(); setMenu(null); } }}
        onDoubleClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left + r.width / 3) seek(-10); else if (e.clientX > r.right - r.width / 3) seek(10); else toggleFs(); }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />

      {waiting && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-background/40 shadow-[0_0_40px_hsl(var(--primary)/0.4)] backdrop-blur-md">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      )}
      {hold !== null && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-2xl bg-background/70 px-4 py-2 text-center backdrop-blur-xl">
          <div className="flex items-center gap-2 text-[11px] tabular-nums">{HOLD_SPEEDS.map((x) => <span key={x} className={x === hold ? "font-bold text-primary" : "text-muted-foreground"}>{x}x</span>)}</div>
          <p className="mt-1 text-xs font-semibold text-foreground">⏩ {hold}x Speed Playing</p>
        </div>
      )}
      {showNet && netSpeed && visible && (
        <button onClick={toggleNet} className="absolute left-3 top-3 z-30 rounded-full bg-background/60 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur-md" aria-label="Hide network speed">{netSpeed} ✕</button>
      )}
      {flash && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/60 px-4 py-2 text-sm font-semibold text-foreground backdrop-blur-md">{flash}</div>
      )}

      {menu === "help" && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-background/50 backdrop-blur-sm" onClick={() => setMenu(null)}>
          <div className="w-[min(92%,420px)] rounded-2xl border border-border/40 bg-background/85 p-5 text-sm shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 font-semibold text-foreground">Keyboard shortcuts</p>
            {[["Space / K", "Play / Pause"], ["← / J", "Back 10s"], ["→ / L", "Forward 10s"], ["Shift + ← / →", "Back / Forward 30s"], ["S", "Skip intro (+85s)"], ["↑ / ↓", "Volume"], ["M", "Mute"], ["F", "Fullscreen"], ["P", "Picture-in-picture"], ["C", "Subtitles on/off"], ["< / >", "Slower / Faster"], ["?", "This help"]].map(([k, d]) => (
              <div key={k} className="flex justify-between border-b border-border/20 py-1.5 last:border-0"><span className="text-muted-foreground">{d}</span><kbd className="rounded bg-foreground/10 px-2 font-mono text-xs text-foreground">{k}</kbd></div>
            ))}
          </div>
        </div>
      )}

      {/* Skip intro pill */}
      {isSeries && time > 5 && time < 240 && visible && (
        <button onClick={() => seek(85)} className="absolute bottom-24 right-4 z-30 rounded-full border border-border/40 bg-background/60 px-4 py-2 text-sm font-semibold text-foreground backdrop-blur-xl hover:bg-background/80">
          Skip Intro
        </button>
      )}

      <div className={`absolute inset-x-2 bottom-2 z-30 rounded-2xl border border-border/30 bg-background/60 px-3 pb-2 pt-3 shadow-2xl backdrop-blur-xl transition-opacity duration-300 sm:inset-x-4 sm:bottom-4 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        {/* timeline */}
        <div
          className="group relative h-4 cursor-pointer"
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = e.clientX - r.left; setHover({ x, t: (x / r.width) * dur }); }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const el = v(); if (el && dur) el.currentTime = ((e.clientX - r.left) / r.width) * dur; }}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/20 transition-all group-hover:h-1.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/30" style={{ width: `${bufPct}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow group-hover:opacity-100" style={{ left: `${pct}%` }} />
          {hover && <div className="absolute -top-7 -translate-x-1/2 rounded bg-background/90 px-1.5 py-0.5 text-xs text-foreground" style={{ left: hover.x }}>{fmt(hover.t)}</div>}
        </div>

        <div className="mt-1 flex items-center gap-0.5 sm:gap-1">
          <button className={btn} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
          <button className={`${btn} hidden sm:grid`} onClick={() => seek(-30)} aria-label="Back 30 seconds"><span className="text-[11px] font-bold">-30</span></button>
          <button className={btn} onClick={() => seek(-10)} aria-label="Back 10 seconds"><RotateCcw className="h-4 w-4" /></button>
          <button className={btn} onClick={() => seek(10)} aria-label="Forward 10 seconds"><RotateCw className="h-4 w-4" /></button>
          <button className={`${btn} hidden sm:grid`} onClick={() => seek(30)} aria-label="Forward 30 seconds"><span className="text-[11px] font-bold">+30</span></button>
          <button className={`${btn} hidden sm:grid`} onClick={() => { const el = v(); if (el) el.muted = !el.muted; }} aria-label="Mute">{muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => { const el = v(); if (el) { el.volume = Number(e.target.value); el.muted = false; } }} className="hidden w-16 accent-[hsl(var(--primary))] md:block" aria-label="Volume" />
          <span className="ml-1 whitespace-nowrap text-xs tabular-nums text-muted-foreground">{fmt(time)} / {fmt(dur)}</span>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <span className="hidden rounded-md border border-border/40 px-1.5 py-0.5 text-[10px] font-bold text-foreground sm:inline">{quality}</span>
            {isSeries && onNextEpisode && <button className={btn} onClick={onNextEpisode} aria-label="Next episode"><SkipForward className="h-4 w-4" /></button>}
            <div className="relative">
              <button className={`${btn} w-auto px-2 text-xs font-semibold`} onClick={() => setMenu(menu === "speed" ? null : "speed")} aria-label="Playback speed"><Gauge className="mr-1 h-4 w-4" />{speed}x</button>
              {menu === "speed" && (
                <div className={pop}>
                  <div className="grid grid-cols-4 gap-1">{SPEEDS.map((s) => <button key={s} className={item(speed === s)} onClick={() => setRate(s)}>{s}x</button>)}</div>
                  <label className="mt-2 block px-1 text-xs text-muted-foreground">Fine tune: {speed}x
                    <input type="range" min={0.25} max={3} step={0.05} value={speed} onChange={(e) => setRate(Number(e.target.value))} className="mt-1 w-full accent-[hsl(var(--primary))]" />
                  </label>
                </div>
              )}
            </div>
            {audioTracks.length > 1 && (
              <div className="relative">
                <button className={btn} onClick={() => setMenu(menu === "audio" ? null : "audio")} aria-label="Audio track"><Languages className="h-4 w-4" /></button>
                {menu === "audio" && <div className={pop}>{audioTracks.map((t) => <button key={t.index} className={item(activeTrack === t.index)} onClick={() => { onSelectAudio(t.index); setMenu(null); }}>{t.label}</button>)}</div>}
              </div>
            )}
            {subs.length > 0 && (
              <div className="relative">
                <button className={btn} onClick={() => setMenu(menu === "subs" ? null : "subs")} aria-label="Subtitles"><Subtitles className={`h-4 w-4 ${activeSub >= 0 ? "text-primary" : ""}`} /></button>
                {menu === "subs" && (
                  <div className={pop}>
                    <button className={item(activeSub < 0)} onClick={() => { selectSub(-1); setMenu(null); }}>Off</button>
                    {subs.map((s) => <button key={s.i} className={item(activeSub === s.i)} onClick={() => { selectSub(s.i); setMenu(null); }}>{s.label}</button>)}
                  </div>
                )}
              </div>
            )}
            <div className="relative">
              <button className={btn} onClick={() => setMenu(menu === "color" ? null : "color")} aria-label="Color presets"><Palette className={`h-4 w-4 ${color ? "text-primary" : ""}`} /></button>
              {menu === "color" && (
                <div className={pop}>
                  {COLOR_PRESETS.map((c, i) => <button key={c.name} className={item(color === i)} onClick={() => pickColor(i)}>{c.name}</button>)}
                  <button className={`${item(showNet)} mt-1 border-t border-border/30`} onClick={toggleNet}>{showNet ? "Hide" : "Show"} network speed</button>
                </div>
              )}
            </div>
            <button className={`${btn} hidden sm:grid`} onClick={onTogglePip} aria-label="Picture in picture"><PictureInPicture2 className="h-4 w-4" /></button>
            <button className={`${btn} hidden md:grid`} onClick={() => setMenu("help")} aria-label="Keyboard shortcuts"><Keyboard className="h-4 w-4" /></button>
            <button className={btn} onClick={toggleFs} aria-label="Fullscreen">{fs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmbedContextBar({ containerRef, onNextEpisode, onNextServer, hasNextServer }: { containerRef: RefObject<HTMLDivElement | null>; onNextEpisode?: (() => void) | undefined; onNextServer?: () => void; hasNextServer?: boolean }) {
  const toggleFs = () => { const c = containerRef.current; if (!c) return; document.fullscreenElement ? void document.exitFullscreen() : void c.requestFullscreen?.(); };
  const b = "rounded-full px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/15";
  return (
    <div className="pointer-events-auto absolute right-2 top-2 z-20 flex gap-1 rounded-full border border-border/30 bg-background/60 p-1 opacity-70 shadow-xl backdrop-blur-xl transition hover:opacity-100">
      {onNextEpisode && <button className={b} onClick={onNextEpisode}>Next episode</button>}
      {hasNextServer && onNextServer && <button className={b} onClick={onNextServer}>Switch source</button>}
      <button className={b} onClick={toggleFs} aria-label="Fullscreen"><Maximize className="h-3.5 w-3.5" /></button>
    </div>
  );
}
