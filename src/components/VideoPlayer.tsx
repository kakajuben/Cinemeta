import { AmbientGlow } from "@/components/player/AmbientGlow";
import { DownloadHub } from "@/components/player/DownloadHub";
import { sanitizeVideoEmbedUrl } from "@/lib/urlSanitizer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlassControls, EmbedContextBar } from "@/components/player/GlassControls";
import Hls from "hls.js";
import {
  ExternalLink,
  Download,
  Monitor,
  X,
  Copy,
  Loader2,
  ArrowLeft,
  PictureInPicture2,
  AudioLines,
  RotateCcw,
  AlertTriangle,
  StepForward,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface VideoSourceExtended {
  idx: number;
  server: string;
  url: string;
  inAppUrl?: string;
  type?: string;
  downloadUrl?: string;
  vkDownloadUrl?: string;
  mirrorDownloadUrl?: string;
  externalUrl?: string;
  isAddon?: boolean;
  season?: number | null;
  episode?: string | number | null;
  otherUrl?: string;
}

interface VideoPlayerProps {
  sources: any[];
  episodes?: any[];
  itemId?: string;
  imdbId?: string | null;
  activeSeason?: number;
  activeEpisode?: number;
  onEpisodeChange?: (season: number, episode: number) => void;
  isFetchingAddons?: boolean;
  telegramUrl?: string | null;
  vkUrl?: string | null;
  snapWcUrl?: string;
  title: string;
  poster?: string;
  backdrop?: string | null;
  synopsis?: string;
  type?: string;
  onClose?: () => void;
}

const toEmbedUrl = (rawUrl?: string): string => {
  if (!rawUrl) return "";
  let url = sanitizeVideoEmbedUrl(rawUrl);
  
  const vkMatch = url.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/i);
  if (vkMatch) return `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}&hd=2&autoplay=1`;
  
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;

  if (url.startsWith('//')) {
    url = `https:${url}`;
  } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  
  return url;
};

const formatTime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const srt2vtt = (srt: string) => {
  let vtt = "WEBVTT\n\n";
  vtt += srt
    .replace(/\r\n|\r/g, "\n")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .replace(/<font color="[^"]*">/g, "")
    .replace(/<\/font>/g, "");
  return vtt;
};

export function VideoPlayer({
  sources = [],
  episodes = [],
  itemId = "item",
  imdbId,
  activeSeason: externalActiveSeason,
  activeEpisode: externalActiveEpisode,
  onEpisodeChange,
  isFetchingAddons = false,
  snapWcUrl = "https://snapwc.com/vk",
  title,
  poster,
  backdrop,
  synopsis,
  type,
  onClose,
}: VideoPlayerProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ambientOn, setAmbientOn] = useState(true);
  useEffect(() => {
    try { setAmbientOn(localStorage.getItem("kino_ambient_glow") !== "0"); } catch {}
  }, []);
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  const lastSavedRef = useRef(0);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [audioTracks, setAudioTracks] = useState<{ index: number; label: string }[]>([]);
  const [activeTrack, setActiveTrack] = useState(0);
  const [sandboxLifted, setSandboxLifted] = useState(false);
  
  const [subtitles, setSubtitles] = useState<{ url: string; label: string; srclang: string }[]>([]);

  const isSeries = episodes && episodes.length > 0;
  const [showStreams, setShowStreams] = useState(!isSeries);

  const seasons = useMemo(() => {
    const set = new Set<number>();
    if (episodes && episodes.length > 0) {
      episodes.forEach((e) => set.add(e.season));
    } else {
      sources.forEach((s) => {
        if (typeof s.season === "number") set.add(s.season);
      });
    }
    return [...set].sort((a, b) => a - b);
  }, [sources, episodes]);

  const [viewedSeason, setViewedSeason] = useState<number | null>(null);
  const activeSeason = externalActiveSeason ?? seasons[0] ?? null;

  useEffect(() => {
    if (viewedSeason === null && seasons.length > 0) {
      setViewedSeason(externalActiveSeason ?? seasons[0] ?? null);
    }
  }, [externalActiveSeason, seasons, viewedSeason]);

  const handleSeasonChange = (s: number) => setViewedSeason(s);
  const handleEpisodeClick = (season: number, episode: number) => {
    if (onEpisodeChange) onEpisodeChange(season, episode);
    setShowStreams(true);
    setActiveIdx(0);
  };

  const nextEpisodeDetails = useMemo(() => {
    if (!isSeries || !episodes) return null;
    const currentList = episodes.filter((e) => e.season === activeSeason);
    const nextInSeason = currentList.find((e) => e.episode === (externalActiveEpisode ?? 1) + 1);
    if (nextInSeason) return nextInSeason;
    const nextSeason = seasons.find((s) => s > (activeSeason ?? 1));
    if (nextSeason) {
      const firstOfNext = episodes.find((e) => e.season === nextSeason && e.episode === 1);
      if (firstOfNext) return firstOfNext;
    }
    return null;
  }, [isSeries, episodes, activeSeason, externalActiveEpisode, seasons]);

  const [autoNext, setAutoNext] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    try { if (localStorage.getItem("kino_autonext") === "0") setAutoNext(false); } catch {}
  }, []);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      if (nextEpisodeDetails) handleEpisodeClick(nextEpisodeDetails.season, nextEpisodeDetails.episode);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);
  useEffect(() => { setCountdown(null); }, [externalActiveEpisode, activeSeason]);

  const visible = useMemo(() => {
    return sources
      .map((s, idx) => ({ ...s, idx }))
      .filter((s: VideoSourceExtended) => {
        if (s.isAddon && s.url && (s.url.startsWith("magnet:") || s.url.startsWith("stremio:"))) return false;
        return true;
      });
  }, [sources]);

  const manualSources = visible.filter((s) => !s.isAddon);
  const addonSources = visible.filter((s) => s.isAddon);

  const activeSource = visible.find(v => v.idx === activeIdx) ?? visible[0];
  const rawPlayerUrl = activeSource?.inAppUrl || activeSource?.url;
  const playerUrl = useMemo(() => toEmbedUrl(rawPlayerUrl), [rawPlayerUrl]);
  const isDirectVideo = Boolean(rawPlayerUrl?.match(/\.(mp4|webm|mkv|mov|m3u8)(\?.*)?$/i));
  const isHls = Boolean(rawPlayerUrl?.match(/\.m3u8(\?.*)?$/i));

  const selectedEpisodeDetails = useMemo(() => {
    return episodes?.find((e) => e.season === activeSeason && e.episode === externalActiveEpisode);
  }, [episodes, activeSeason, externalActiveEpisode]);

  // Priority Image Resolver
  const resolveThumbnail = useCallback((e: any) => {
    if (e?.thumbnail && typeof e.thumbnail === "string" && e.thumbnail.trim() !== "") {
      return e.thumbnail;
    }
    if (imdbId) {
      const cleanImdbId = imdbId.match(/(tt\d{7,10})/i)?.[1]?.toLowerCase();
      if (cleanImdbId && e?.season && e?.episode) {
        const epNum = typeof e.episode === "number" ? e.episode : Number(String(e.episode).replace(/\D/g, ""));
        if (!isNaN(epNum) && epNum > 0) {
          return `https://episodes.metahub.space/${cleanImdbId}/${e.season}/${epNum}/w780.jpg`;
        }
      }
    }
    return backdrop || poster || "";
  }, [imdbId, backdrop, poster]);

  const handleImageFallback = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.currentTarget;
    const cleanId = imdbId?.match(/(tt\d{7,10})/i)?.[1]?.toLowerCase();
    const s = Number(img.dataset["season"]);
    const ep = Number(img.dataset["ep"]);
    if (cleanId && s > 0 && ep > 0 && !img.src.includes("episodes.metahub.space") && img.dataset["tried"] !== "mh") {
      img.dataset["tried"] = "mh";
      img.src = `https://episodes.metahub.space/${cleanId}/${s}/${ep}/w780.jpg`;
      return;
    }
    const fb = backdrop || poster;
    if (fb && img.src !== fb) {
      img.src = fb;
    } else {
      img.style.display = "none";
    }
  };

  const resumeKey = `trybox:resume:${itemId}:${activeSeason ?? 0}:${externalActiveEpisode ?? 0}`;

  useEffect(() => {
    setMounted(false);
    setPlaybackFailed(false);
    setSandboxLifted(false);
    setAudioTracks([]);
    setActiveTrack(0);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, [activeIdx, showStreams]);

  useEffect(() => {
    if (!isSeries) setShowStreams(true);
  }, [isSeries]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(resumeKey);
    const seconds = raw ? Number(raw) : 0;
    setResumeAt(Number.isFinite(seconds) && seconds > 10 ? seconds : null);
  }, [resumeKey, mounted, activeSeason, externalActiveEpisode]);

  useEffect(() => {
    if (!isDirectVideo || !mounted) return;
    let isCancelled = false;
    async function fetchSubs() {
      try {
        const cleanId = itemId?.match(/(tt\d{7,10})/i)?.[1];
        if (!cleanId) return;

        const typeStr = isSeries ? "series" : "movie";
        const reqId = isSeries ? `${cleanId}:${activeSeason}:${externalActiveEpisode}` : cleanId;
        const res = await fetch(`https://subtitles.strem.io/subtitles/${typeStr}/${reqId}.json`).catch(() => null);
        if (!res || !res.ok) return;
        const data = await res.json();
        
        if (data && Array.isArray(data.subtitles) && !isCancelled) {
          const engSubs = data.subtitles.filter((s: any) => s.lang === "eng" || s.lang === "English").slice(0, 3);
          const loaded = await Promise.all(
            engSubs.map(async (sub: any, i: number) => {
              const subRes = await fetch(sub.url).catch(() => null);
              if (!subRes || !subRes.ok) return null;
              const srt = await subRes.text();
              const vtt = srt2vtt(srt);
              const blobUrl = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
              return { url: blobUrl, label: `English ${i + 1}`, srclang: "en" };
            })
          );
          if (!isCancelled) {
            setSubtitles(loaded.filter(Boolean) as any);
          }
        }
      } catch {}
    }
    void fetchSubs();
    return () => { isCancelled = true; };
  }, [isDirectVideo, mounted, itemId, activeSeason, externalActiveEpisode, isSeries]);

  useEffect(() => {
    if (mounted && isDirectVideo && isHls && videoRef.current) {
      const video = videoRef.current;
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, maxBufferLength: 60, maxMaxBufferLength: 120, backBufferLength: 30, startLevel: -1, abrEwmaDefaultEstimate: 1_000_000, fragLoadingMaxRetry: 6, manifestLoadingMaxRetry: 4, levelLoadingMaxRetry: 4 });
        hlsRef.current = hls;
        hls.loadSource(playerUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            setPlaybackFailed(true);
            toast.error("HLS stream failed to load.");
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = playerUrl;
      }
    }
  }, [mounted, isDirectVideo, isHls, playerUrl]);

  useEffect(() => {
    if (!mounted || !isDirectVideo || true) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          break;
        case "f":
          e.preventDefault();
          if (document.fullscreenElement) document.exitFullscreen();
          else v.requestFullscreen();
          break;
        case "m":
          e.preventDefault();
          v.muted = !v.muted;
          break;
        case "arrowright":
          e.preventDefault();
          v.currentTime += 10;
          break;
        case "arrowleft":
          e.preventDefault();
          v.currentTime -= 10;
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted, isDirectVideo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(orientation: landscape)");
    const onChange = () => {
      const box = playerBoxRef.current;
      const v = videoRef.current;
      if (!box || window.innerWidth > 1024) return;
      if (mq.matches && v && !v.paused && !document.fullscreenElement) {
        void box.requestFullscreen?.().catch(() => {});
      } else if (!mq.matches && document.fullscreenElement === box) {
        void document.exitFullscreen?.().catch(() => {});
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const handleNextServer = () => {
    const nextIdx = visible.findIndex((v: VideoSourceExtended) => v.idx === activeIdx) + 1;
    if (nextIdx < visible.length) setActiveIdx(visible[nextIdx].idx);
  };

  const saveProgress = useCallback((seconds: number, thumbnail?: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(resumeKey, String(Math.floor(seconds)));
    try {
      const cwKey = `trybox:cw_list`;
      const cwListStr = window.localStorage.getItem(cwKey);
      let cwList: any[] = cwListStr ? JSON.parse(cwListStr) : [];
      cwList = cwList.filter((c: any) => c.itemId !== itemId);
      cwList.unshift({
        itemId,
        title: isSeries ? `${title}` : title,
        poster: thumbnail || poster,
        timestamp: Math.floor(seconds),
        season: activeSeason,
        episode: externalActiveEpisode,
        updatedAt: Date.now()
      });
      window.localStorage.setItem(cwKey, JSON.stringify(cwList.slice(0, 15)));
    } catch (e) {
      console.warn("Failed to save CW metadata");
    }
  }, [resumeKey, itemId, title, poster, isSeries, activeSeason, externalActiveEpisode]);

  const handleTimeUpdate = useCallback(() => {
    const el = videoRef.current;
    if (!el || typeof window === "undefined") return;
    const now = Date.now();
    if (now - lastSavedRef.current < 15000) return;
    lastSavedRef.current = now;
    if (el.currentTime > 5 && (!el.duration || el.currentTime < el.duration - 10)) {
      const art = selectedEpisodeDetails ? resolveThumbnail(selectedEpisodeDetails) : undefined;
      saveProgress(el.currentTime, art);
    } else if (el.duration && el.currentTime >= el.duration - 10) {
      window.localStorage.removeItem(resumeKey);
    }
  }, [resumeKey, saveProgress, selectedEpisodeDetails, resolveThumbnail]);

  useEffect(() => {
    const handleUnload = () => {
      if (videoRef.current && videoRef.current.currentTime > 5) {
        const art = selectedEpisodeDetails ? resolveThumbnail(selectedEpisodeDetails) : undefined;
        saveProgress(videoRef.current.currentTime, art);
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [saveProgress, selectedEpisodeDetails, resolveThumbnail]);

  const handleLoadedMetadata = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const tracks = (el as any).audioTracks;
    if (tracks && tracks.length > 1) {
      const list: { index: number; label: string }[] = [];
      for (let i = 0; i < tracks.length; i += 1) {
        const t = tracks[i];
        list.push({ index: i, label: t?.label || t?.language || `Audio ${i + 1}` });
        if (t?.enabled) setActiveTrack(i);
      }
      setAudioTracks(list);
    }
  }, []);

  const selectAudioTrack = (index: number) => {
    const el = videoRef.current;
    const tracks = el ? (el as any).audioTracks : null;
    if (!tracks) return;
    for (let i = 0; i < tracks.length; i += 1) tracks[i].enabled = i === index;
    setActiveTrack(index);
  };

  const togglePip = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await videoRef.current.requestPictureInPicture();
    } catch {
      toast.error("Picture-in-picture is not available.");
    }
  };

  const applyResume = () => {
    if (videoRef.current && resumeAt) {
      videoRef.current.currentTime = resumeAt;
      void videoRef.current.play().catch(() => undefined);
    }
    setResumeAt(null);
  };

  const dismissResume = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(resumeKey);
    setResumeAt(null);
  };

  const handleMobileDoubleTap = (e: React.MouseEvent<HTMLVideoElement, MouseEvent>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const isRight = e.clientX > rect.left + rect.width / 2;
    videoRef.current.currentTime += isRight ? 10 : -10;
  };

  if (!activeSource && (!episodes || episodes.length === 0)) {
    return (
      <div className="trybox-glass relative w-full space-y-5 rounded-3xl border border-white/15 bg-white/[0.06] p-5 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl">
        <p className="text-sm text-muted-foreground">No streaming source added yet.</p>
      </div>
    );
  }

  const vkLink = activeSource?.vkDownloadUrl || activeSource?.url;
  const mirrorLink = activeSource?.mirrorDownloadUrl || activeSource?.downloadUrl;
  const externalLinkUrl = activeSource?.externalUrl || activeSource?.url;

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  };

  const handleSnapWc = async () => {
    const ok = await copyToClipboard(vkLink);
    toast[ok ? "success" : "error"](
      ok ? "VK link copied! Paste into SnapWC to download" : "Could not copy the link — copy it manually",
    );
    window.open(snapWcUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div className="trybox-glass relative w-full space-y-6 rounded-3xl border border-white/15 bg-white/[0.06] p-6 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl sm:p-8">
        
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {showStreams && isSeries && (
              <button
                onClick={() => setShowStreams(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition"
              >
                <ArrowLeft className="size-4" /> Back to Episodes
              </button>
            )}
            {!showStreams && isSeries && (
              <span className="text-sm font-bold uppercase tracking-wider text-white">Select Episode</span>
            )}
            {showStreams && mounted && !isDirectVideo && (
              <button
                onClick={handleNextServer}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary shadow-sm hover:bg-primary/20 transition"
              >
                <Zap className="size-3.5" /> Server slow? Switch
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showStreams && nextEpisodeDetails && (
              <button
                onClick={() => handleEpisodeClick(nextEpisodeDetails.season, nextEpisodeDetails.episode)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-xs font-bold text-white shadow-md backdrop-blur hover:bg-white/20 transition"
              >
                Next (S{nextEpisodeDetails.season}:E{nextEpisodeDetails.episode}) <StepForward className="size-3.5" />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition"
              >
                <X className="size-4" /> Close
              </button>
            )}
          </div>
        </div>

        {/* EPISODE BROWSER */}
        {!showStreams && isSeries && (
          <>
            {seasons.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-3 border-b border-white/10">
                {seasons.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSeasonChange(s)}
                    className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                      viewedSeason === s
                        ? "border-primary bg-primary text-primary-foreground shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    Season {s}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-2 rounded-xl custom-scrollbar">
              {episodes
                .filter((e) => e.season === viewedSeason)
                .map((e) => {
                  const resolvedImg = resolveThumbnail(e);
                  return (
                    <button
                      key={e.id || `${e.season}-${e.episode}`}
                      onClick={() => handleEpisodeClick(e.season, e.episode)}
                      className={`flex items-start gap-4 p-3 rounded-xl border text-left transition group ${
                        activeSeason === e.season && externalActiveEpisode === e.episode
                          ? "border-primary/50 bg-primary/10 hover:bg-primary/20"
                          : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="relative shrink-0 w-32 h-20 bg-black/40 rounded-lg overflow-hidden flex items-center justify-center ring-1 ring-white/10">
                        {resolvedImg ? (
                          <img
                            src={resolvedImg}
                            alt={e.title || `Episode ${e.episode}`}
                            loading="lazy"
                            data-season={e.season}
                            data-ep={typeof e.episode === "number" ? e.episode : String(e.episode).match(/\d+/)?.[0]}
                            onError={handleImageFallback}
                            className="absolute inset-0 w-full h-full object-cover opacity-90 transition group-hover:scale-105"
                          />
                        ) : null}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                        <span className="absolute bottom-1 left-1 rounded-md border border-white/20 bg-black/50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white backdrop-blur-md">
                          S{String(e.season).padStart(2, "0")} E{String(typeof e.episode === "number" ? e.episode : String(e.episode).match(/\d+/)?.[0] ?? "").padStart(2, "0")}
                        </span>
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center backdrop-blur-[1px]">
                          <Monitor className="size-6 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 py-1">
                        <h4
                          className={`font-semibold text-sm truncate ${
                            activeSeason === e.season && externalActiveEpisode === e.episode
                              ? "text-primary"
                              : "text-white"
                          }`}
                        >
                          {e.episode}. {e.title || `Episode ${e.episode}`}
                        </h4>
                        {e.released && (
                          <p className="text-[11px] text-white/60 mb-1 font-medium">
                            {new Date(e.released).toLocaleDateString()}
                          </p>
                        )}
                        {e.description && (
                          <p className="text-xs text-white/50 line-clamp-2 leading-relaxed">
                            {e.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          </>
        )}

        {/* STREAM SELECTOR */}
        {showStreams && (
          <>
            {((isSeries && selectedEpisodeDetails) || !isSeries) && (
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/30 p-3 ring-1 ring-white/5 shadow-inner">
                <div
                  className={`shrink-0 bg-black/40 rounded-lg overflow-hidden relative ${
                    isSeries ? "w-24 h-14" : "w-12 h-16 sm:w-16 sm:h-24"
                  }`}
                >
                  {isSeries ? (
                    <img
                      src={resolveThumbnail(selectedEpisodeDetails)}
                      onError={handleImageFallback}
                      className="absolute inset-0 w-full h-full object-cover opacity-80"
                      alt=""
                    />
                  ) : poster ? (
                    <img
                      src={poster}
                      onError={handleImageFallback}
                      className="absolute inset-0 w-full h-full object-cover opacity-80"
                      alt=""
                    />
                  ) : (
                    <span className="flex items-center justify-center w-full h-full text-[9px] text-white/40 uppercase text-center">
                      No Img
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm text-white truncate">
                    {isSeries
                      ? `Episode ${selectedEpisodeDetails?.episode}: ${selectedEpisodeDetails?.title || `Episode ${selectedEpisodeDetails?.episode}`}`
                      : title}
                  </h4>
                  <p className="text-xs text-white/50 line-clamp-1 sm:line-clamp-2 mt-0.5">
                    {isSeries
                      ? selectedEpisodeDetails?.description || "Pick a stream source below to start watching."
                      : synopsis || "Pick a stream source below to start watching."}
                  </p>
                </div>
              </div>
            )}

            {visible.length > 0 && (
              <div className="space-y-5 pt-1">
                {manualSources.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-white/50 uppercase tracking-widest ml-1">
                      Manual Link Streaming
                    </h4>
                    <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                      {manualSources.map((s) => (
                        <button
                          key={s.idx}
                          onClick={() => setActiveIdx(s.idx)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            activeIdx === s.idx
                              ? "border-primary bg-primary/15 text-primary shadow-[0_0_10px_rgba(168,85,247,0.2)]"
                              : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {s.server || `Server ${s.idx + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {addonSources.length > 0 || isFetchingAddons ? (
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-primary uppercase tracking-widest ml-1 flex items-center gap-2">
                      Community Addons
                      {isFetchingAddons && (
                        <span className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                          <Loader2 className="size-3 animate-spin" /> Fetching...
                        </span>
                      )}
                    </h4>
                    <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                      {addonSources.map((s) => (
                        <button
                          key={s.idx}
                          onClick={() => setActiveIdx(s.idx)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            activeIdx === s.idx
                              ? "border-amber-400 bg-amber-400/15 text-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.2)]"
                              : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {s.server || `Addon Stream`}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {activeSource && (
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 shadow-inner ring-1 ring-white/5 backdrop-blur-md">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <p className="truncate text-xs font-medium text-white">
                    {activeSource.episode || activeSource.server || "Stream"}{" "}
                    {activeSource.type ? <span className="text-white/50">· {activeSource.type}</span> : ""}
                  </p>
                  {activeSource.isAddon && (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 border border-amber-400/20 bg-amber-400/10 px-2.5 py-0.5 rounded-full">
                      Addon Source
                    </span>
                  )}
                </div>

                <div className={`grid gap-2 ${activeSource.otherUrl ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                  <button
                    onClick={() => setMounted(true)}
                    disabled={!playerUrl}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition disabled:opacity-50"
                  >
                    <Monitor className="size-4" /> Try in-app player
                  </button>
                  <button
                    onClick={handleSnapWc}
                    disabled={!vkLink}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition disabled:opacity-50"
                  >
                    <Download className="size-4 text-sky-400" /> Download vk link
                  </button>
                  <a
                    href={externalLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:brightness-110 shadow-[0_0_15px_rgba(168,85,247,0.3)] transition"
                  >
                    <ExternalLink className="size-4" /> Launch External
                  </a>
                  {activeSource.otherUrl && (
                    <a
                      href={activeSource.otherUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition"
                    >
                      <ExternalLink className="size-4" /> Other Link
                    </a>
                  )}
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={async () => {
                      const ok = await copyToClipboard(vkLink || activeSource.url);
                      toast[ok ? "success" : "error"](ok ? "Link copied" : "Could not copy the link");
                    }}
                    disabled={!vkLink && !activeSource.url}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-transparent px-3 py-2 text-xs font-medium text-white/50 hover:bg-white/5 hover:text-white transition disabled:opacity-50"
                  >
                    <Copy className="size-4" /> Copy stream link
                  </button>
                  {mirrorLink && (
                    <a
                      href={mirrorLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20 transition"
                    >
                      <Download className="size-4" /> Mirror Download
                    </a>
                  )}
                </div>

                {(() => {
                  const directFile =
                    /\.(mp4|mkv|webm|m3u8)(\?|$)/i.test(activeSource.url || "")
                      ? activeSource.url
                      : "";
                  const dl = mirrorLink || directFile;
                  if (!dl) return null;
                  return (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/60">
                        External Download
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <a
                          href={dl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition"
                        >
                          <ExternalLink className="size-4" /> Open Download Page
                        </a>
                        <button
                          onClick={async () => {
                            const ok = await copyToClipboard(dl);
                            toast[ok ? "success" : "error"](
                              ok ? "Download link copied — paste into IDM / 1DM / ADM" : "Could not copy the link",
                            );
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition"
                        >
                          <Copy className="size-4" /> Copy Direct Link
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {activeSource && (!playerUrl || playbackFailed) && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs font-semibold text-amber-200 backdrop-blur-md">
                <AlertTriangle className="size-4" />
                {!playerUrl
                  ? "Stream source offline — try another server below."
                  : "Playback failed — launch external or try another server."}
              </div>
            )}
          </>
        )}
      </div>

      {showStreams && mounted && activeSource && (
        <div className="mt-4 space-y-3 block animate-in fade-in zoom-in-95 duration-300">
          {resumeAt && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-semibold text-white backdrop-blur-md">
              <RotateCcw className="size-4 text-primary" />
              <span>Resume at {formatTime(resumeAt)}?</span>
              <button
                onClick={applyResume}
                className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground transition hover:brightness-110"
              >
                Resume
              </button>
              <button
                onClick={dismissResume}
                className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Restart
              </button>
            </div>
          )}

          {!isDirectVideo && (
            <p className="text-[11px] text-white/40 text-center uppercase tracking-widest">
              Click outside the video player to use Keyboard controls (Space, F, M)
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-2">
            {isDirectVideo && typeof document !== "undefined" && document.pictureInPictureEnabled && (
              <button
                onClick={() => void togglePip()}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-white/20"
              >
                <PictureInPicture2 className="size-3.5" /> Picture-in-picture
              </button>
            )}

            {audioTracks.length > 1 && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white">
                <AudioLines className="size-3.5 text-primary" />
                <span className="text-white/60">Audio</span>
                {audioTracks.map((t) => (
                  <button
                    key={t.index}
                    onClick={() => selectAudioTrack(t.index)}
                    className={`rounded-full px-2 py-0.5 transition ${
                      activeTrack === t.index ? "bg-primary text-primary-foreground" : "text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isSeries && (
            <label className="mb-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoNext}
                onChange={(e) => {
                  setAutoNext(e.target.checked);
                  try { localStorage.setItem("kino_autonext", e.target.checked ? "1" : "0"); } catch {}
                }}
              />
              Auto-play next episode
            </label>
          )}
          <div className="relative">
          {ambientOn && <AmbientGlow poster={backdrop || poster || null} active={isPlaying || !isDirectVideo} />}
          <div ref={playerBoxRef} className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/5 aspect-video relative">
            {countdown !== null && nextEpisodeDetails && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-md">
                <div className="rounded-2xl border border-border bg-card/80 p-5 text-center shadow-xl">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Up next</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    S{nextEpisodeDetails.season} E{nextEpisodeDetails.episode}
                    {nextEpisodeDetails.title ? ` — ${nextEpisodeDetails.title}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">Playing in {countdown}s</p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      onClick={() => setCountdown(0)}
                    >
                      Play now
                    </button>
                    <button
                      className="rounded-full border border-border px-4 py-2 text-sm text-foreground"
                      onClick={() => setCountdown(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            {isDirectVideo ? (
              <>
              <video
                key={playerUrl}
                ref={videoRef}
                autoPlay
                playsInline
                preload="auto"
                className="w-full h-full object-contain bg-black"
                src={!isHls ? playerUrl : undefined}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => {
                  const pos = visible.findIndex((v) => v.idx === activeIdx);
                  const next = visible[pos + 1];
                  if (next) {
                    toast("Source failed, switching to backup stream...");
                    setActiveIdx(next.idx);
                  } else {
                    setPlaybackFailed(true);
                  }
                }}
                onEnded={() => {
                  if (autoNext && nextEpisodeDetails) setCountdown(10);
                }}
              >
                {subtitles.map((sub, index) => (
                  <track
                    key={index}
                    kind="subtitles"
                    label={sub.label}
                    srcLang={sub.srclang}
                    src={sub.url}
                    default={index === 0}
                  />
                ))}
                Your browser does not support the video tag.
              </video>
              <GlassControls
                videoRef={videoRef}
                containerRef={playerBoxRef}
                audioTracks={audioTracks}
                activeTrack={activeTrack}
                onSelectAudio={selectAudioTrack}
                onTogglePip={() => void togglePip()}
                isSeries={!!isSeries}
                onNextEpisode={nextEpisodeDetails ? () => handleEpisodeClick(nextEpisodeDetails.season, nextEpisodeDetails.episode) : undefined}
              />
              </>
            ) : (
              <>
                <iframe
                  ref={iframeRef}
                  src={playerUrl}
                  title={title}
                  className="w-full h-full border-0 bg-black"
                  referrerPolicy="origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  allowFullScreen
                />
                <EmbedContextBar
                  containerRef={playerBoxRef}
                  onNextEpisode={nextEpisodeDetails ? () => handleEpisodeClick(nextEpisodeDetails.season, nextEpisodeDetails.episode) : undefined}
                  onNextServer={handleNextServer}
                  hasNextServer={visible.length > 1}
                />
                {sandboxLifted && null}
              </>
            )}
          </div>
          </div>
          <div className="mt-2 flex items-center justify-end">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={ambientOn}
                onChange={(e) => {
                  setAmbientOn(e.target.checked);
                  try { localStorage.setItem("kino_ambient_glow", e.target.checked ? "1" : "0"); } catch {}
                }}
              />
              Ambient glow
            </label>
          </div>
          <DownloadHub streamUrl={rawPlayerUrl} />
        </div>
      )}
    </>
  );
}
