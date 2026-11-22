import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Star, Play, FileEdit, Plus, Sparkles, Trash, Film, Share2 } from "lucide-react";
import { toast } from "sonner";
import { getCatalogItem, listCatalog, type VideoSource } from "@/lib/catalog";
import { fetchAddonStreams, fetchExternalMeta } from "@/lib/addons";
import type { CatalogTrailer } from "@/lib/imdbTrailer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { VideoPlayer } from "@/components/VideoPlayer";
import { WatchParty } from "@/components/party/WatchParty";
import { SiteHeader } from "@/components/SiteHeader";
import { TrailerModal } from "@/components/TrailerModal";
import { healEpisodeThumbnails } from "@/lib/episodeStills";

export const Route = createFileRoute("/title/$id")({
  head: () => ({
    meta: [
      { title: "Watch on TryBox" },
      { name: "description", content: "Stream this title on TryBox with multiple servers, cast and genre browsing." },
      { property: "og:title", content: "Watch on TryBox" },
      { property: "og:description", content: "Stream this title on TryBox with multiple servers." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TitlePage,
  errorComponent: () => <p className="p-10 text-center text-sm text-destructive">This title could not be loaded.</p>,
  notFoundComponent: () => <p className="p-10 text-center text-sm">Title not found.</p>,
});

function TitlePage() {
  const { id } = Route.useParams();
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [playerOpen, setPlayerOpen] = useState(false);
  const [trailerModalOpen, setTrailerModalOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [fetchingAddons, setFetchingAddons] = useState(false);
  
  const [activeSeason, setActiveSeason] = useState<number>(1);
  const [activeEpisode, setActiveEpisode] = useState<number>(1);
  const [addonCache, setAddonCache] = useState<Record<string, VideoSource[]>>({});
  const [currentAddonStreams, setCurrentAddonStreams] = useState<VideoSource[]>([]);
  const [addonFoundCount, setAddonFoundCount] = useState<number | null>(null);

  const [liveTrailers, setLiveTrailers] = useState<CatalogTrailer[]>([]);

  // OPTIMIZED: Trailer fetching stripped out of the main catalog load process
  const { data: item, isLoading } = useQuery({
    queryKey: ["catalog", id],
    queryFn: async () => {
      const localItem = await getCatalogItem(id).catch(() => null);

      const isSeriesOrAnime = localItem?.type === "series" || localItem?.type === "anime";
      const hasVideos = Array.isArray(localItem?.videos) && localItem.videos.length > 0;
      
      let targetImdbId = localItem?.imdb_id;
      if (!targetImdbId || !targetImdbId.startsWith("tt")) {
        const fallbackMatch = (localItem?.poster || localItem?.backdrop || id).match(/(tt\d{7,10})/i);
        targetImdbId = fallbackMatch?.[1] ? fallbackMatch[1].toLowerCase() : id;
      }
      
      let externalMeta = null;
      if (targetImdbId) {
        externalMeta = await fetchExternalMeta(targetImdbId).catch(() => null);
      }

      if (localItem) {
        const externalVideos = externalMeta?.videos || [];
        let activeVideos = externalVideos.length > 0 ? externalVideos : (localItem.videos || []);

        if (targetImdbId && activeVideos.length > 0) {
          activeVideos = await healEpisodeThumbnails(targetImdbId, activeVideos as any[]).catch(() => activeVideos);
        }

        return {
          ...localItem,
          imdb_id: targetImdbId,
          videos: activeVideos,
        };
      }
      return externalMeta;
    },
    staleTime: 1000 * 60 * 60 * 24,
  });

  const { data: all } = useQuery({ queryKey: ["catalog"], queryFn: listCatalog });

  // Zero-Lag Fallback Hydration for Legacy Items missing saved trailers
  useEffect(() => {
    if (!item) return;
    setLiveTrailers([]);
    if (item.trailers && item.trailers.length > 0) {
      setLiveTrailers(item.trailers);
    }
  }, [item]);

  useEffect(() => {
    if (item && item.videos && item.videos.length > 0) {
      const firstEp = item.videos[0];
      setActiveSeason(firstEp.season || 1);
      setActiveEpisode(firstEp.episode || 1);
    }
  }, [item]);

  const related = useMemo(() => {
    if (!item || !all) return [];
    return all
      .filter((c) => c.id !== item.id && (c.type === item.type || c.genres.some((g: string) => item.genres.includes(g))))
      .slice(0, 8);
  }, [item, all]);

  const fetchStreamsForEpisode = async (season: number | null, episode: number | null) => {
    if (!item?.imdb_id) return;
    const cacheKey = `${season}-${episode}`;
    const cached = addonCache[cacheKey];
    if (cached) {
      setCurrentAddonStreams(cached);
      setAddonFoundCount(cached.length);
      return;
    }
    setAddonFoundCount(null);
    setFetchingAddons(true);
    const streams = await fetchAddonStreams(item.imdb_id, item.type, season, episode);
    setAddonCache(prev => ({ ...prev, [cacheKey]: streams }));
    setCurrentAddonStreams(streams);
    setAddonFoundCount(streams.length);
    setFetchingAddons(false);
  };

  const handleEpisodeChange = (season: number, episode: number) => {
    setActiveSeason(season);
    setActiveEpisode(episode);
    fetchStreamsForEpisode(season, episode);
  };
  
  const handleSoftDelete = async () => {
    if (!item?.id) return;
    if (!confirm(`Are you sure you want to remove "${item.title}"?`)) return;
    const { error } = await supabase.from("catalog_items").update({ is_hidden: true } as never).eq("id", item.id);
    if (error) toast.error("Failed to remove title");
    else { toast.success("Title removed successfully"); void router.navigate({ to: "/" }); }
  };

  const combinedSources = useMemo(() => {
    const baseSources = item?.sources || [];
    const firstNum = (v: unknown): number => {
      if (typeof v === "number") return v;
      const m = String(v ?? "").match(/\d+/);
      return m ? parseInt(m[0], 10) : NaN;
    };
    const curSeason = firstNum(activeSeason);
    const curEp = firstNum(activeEpisode);
    const validBase = baseSources.filter((s: VideoSource) => {
      if (!s.url) return false;
      const isSeries = item?.type === "series" || item?.type === "anime" || (item?.videos && item.videos.length > 0);
      if (isSeries) {
        if (s.season !== undefined && s.season !== null && String(s.season) !== "") {
          const sourceSeason = firstNum(s.season);
          if (!isNaN(sourceSeason) && !isNaN(curSeason) && sourceSeason !== curSeason) return false;
        }
        if (s.episode !== undefined && s.episode !== null && s.episode !== "" && !isNaN(curEp)) {
          // Only look at the episode-number part (before any "—" title)
          const label = String(s.episode).split(/—|–/)[0] ?? "";
          const range = label.match(/(\d+)\s*(?:to|-|–)\s*(\d+)/i);
          if (range) {
            const a = parseInt(range[1] ?? "", 10), b = parseInt(range[2] ?? "", 10);
            if (curEp < Math.min(a, b) || curEp > Math.max(a, b)) return false;
          } else {
            const sourceEpNum = firstNum(label);
            if (!isNaN(sourceEpNum) && sourceEpNum !== curEp) return false;
          }
        }
      }
      return true;
    });
    return [...validBase, ...currentAddonStreams];
  }, [item, currentAddonStreams, activeSeason, activeEpisode]);

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-background px-4 pt-28">
        <div className="skeleton mx-auto h-8 w-24 rounded-lg" />
        <div className="mx-auto mt-8 max-w-6xl rounded-3xl border border-border/60 p-6 sm:p-10">
          <div className="flex flex-col gap-8 sm:flex-row">
            <div className="skeleton h-72 w-48 rounded-2xl" />
            <div className="flex-1 space-y-4">
              <div className="skeleton h-12 w-3/4 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!item) return <p className="p-10 text-center text-sm text-muted-foreground">Title not found.</p>;

  const hasLocalLinks = combinedSources.some((s: VideoSource) => Boolean(s.url) && !s.isAddon);
  const isCineMetaItem = Boolean(item.imdb_id);

  const handleWatchNow = async () => {
    if (trailerModalOpen) setTrailerModalOpen(false);
    if (playerOpen) {
      setPlayerOpen(false);
      return;
    }
    setPlayerOpen(true);
    if (item.imdb_id && currentAddonStreams.length === 0) {
      const isSeries = item.type === "series" || item.type === "anime" || (item.videos && item.videos.length > 0);
      await fetchStreamsForEpisode(isSeries ? activeSeason : null, isSeries ? activeEpisode : null);
    }
  };

  const artwork = item.poster;

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden">
      {artwork && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <img src={artwork} alt="" fetchPriority="high" decoding="async" className="size-full scale-150 object-cover opacity-60 blur-[100px] saturate-[2.2]" />
          <div className="absolute inset-0 bg-background/25" />
          <div className="absolute inset-0 bg-[radial-gradient(75%_60%_at_50%_20%,transparent,oklch(0%_0_0_/_0.45))]" />
        </div>
      )}

      <SiteHeader />
      
      {shareOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] grid place-items-center bg-background/70 p-4 backdrop-blur-sm" onClick={() => setShareOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 font-semibold text-foreground">Share {item.title}</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(item.title + " " + (typeof window !== "undefined" ? window.location.href : ""))}`],
                ["Telegram", `https://t.me/share/url?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}&text=${encodeURIComponent(item.title)}`],
                ["X", `https://twitter.com/intent/tweet?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}&text=${encodeURIComponent(item.title)}`],
              ].map(([l, h]) => (
                <a key={l} href={h} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-3 py-2 text-center text-foreground hover:bg-accent">{l}</a>
              ))}
              <button onClick={() => { void navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); setShareOpen(false); }} className="rounded-lg border border-border px-3 py-2 text-foreground hover:bg-accent">Copy link</button>
            </div>
          </div>
        </div>
      )}
      <TrailerModal 
        isOpen={trailerModalOpen} 
        onClose={() => setTrailerModalOpen(false)} 
        trailers={liveTrailers} 
        catalogTitle={item.title} 
      />

      <main id="main-content" className="relative isolate mx-auto max-w-6xl px-3 pb-16 pt-20 sm:px-4 sm:pt-28">
        <button
          type="button"
          onClick={() => window.history.length > 1 ? router.history.back() : void router.navigate({ to: "/" })}
          className="group mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-foreground/90 shadow-md backdrop-blur-md transition hover:border-white/30 hover:bg-white/20 hover:text-foreground"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          <span>Back</span>
        </button>

        <div className="trybox-glass relative rounded-3xl border border-white/15 bg-white/[0.06] p-5 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            {item.poster && (
              <div className="group relative mx-auto w-40 shrink-0 sm:mx-0 sm:w-[220px]">
                <img
                  src={item.poster}
                  alt={`${item.title} poster`}
                  className="aspect-[2/3] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/10 transition duration-500 group-hover:brightness-75"
                />
                {liveTrailers.length > 0 && (
                  <>
                    <div className="absolute inset-0 hidden items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100 sm:flex">
                      <button onClick={() => setTrailerModalOpen(true)} className="rounded-full bg-white/20 p-4 text-white shadow-[0_0_20px_rgba(255,255,255,0.2)] backdrop-blur-md transition hover:scale-110 hover:bg-white/30">
                        <Play className="size-8 fill-current ml-1" />
                      </button>
                    </div>
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center sm:hidden">
                      <button onClick={() => setTrailerModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/75 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                        <Film className="size-3.5" /> Watch Trailer
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-center font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-left sm:text-5xl">{item.title}</h1>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground sm:justify-start sm:gap-3">
                <span className="rounded-full border border-border bg-white/5 px-3 py-1 uppercase tracking-wider">{item.type}</span>
                {item.year && <span>{item.year}</span>}
                {item.rating && <span className="inline-flex items-center gap-1 text-amber-400"><Star className="size-3 fill-current" /> {item.rating}</span>}
              </div>
              {item.synopsis && <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{item.synopsis}</p>}

              <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {hasLocalLinks || isCineMetaItem ? (
                  <button onClick={handleWatchNow} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[0_0_18px_rgba(168,85,247,0.35)] transition hover:brightness-110">
                    {hasLocalLinks ? <Play className="size-4 fill-current" /> : <Sparkles className="size-4" />}
                    {playerOpen ? "Hide servers" : hasLocalLinks ? "Watch now" : "Watch via Community Addons"}
                  </button>
                ) : null}

                {liveTrailers.length > 0 && (
                  <button onClick={() => setTrailerModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-6 py-3 text-sm font-bold text-white shadow-md backdrop-blur-md transition hover:bg-white/20 hidden sm:inline-flex">
                    <Film className="size-4" /> Watch Trailers ({liveTrailers.length})
                  </button>
                )}

                <button
                  onClick={async () => {
                    const url = window.location.href;
                    if (navigator.share) {
                      try { await navigator.share({ title: item.title, text: `Watch ${item.title} on TryBox`, url }); } catch {}
                      return;
                    }
                    setShareOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/20"
                >
                  <Share2 className="size-4" /> Share
                </button>

                {isAdmin && (
                  <button onClick={() => void router.navigate({ to: "/admin", search: { action: "new", autofill: item.imdb_id || item.id } })} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/50 transition hover:border-white/20 hover:bg-white/10 hover:text-white">
                    <Plus className="size-4" /> Force Add Local Links
                  </button>
                )}

                {isAdmin && item.sources && item.sources.length > 0 && (
                  <>
                    <a href={`/admin?action=edit&id=${item.id}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/50 transition hover:border-white/20 hover:bg-white/10 hover:text-white">
                      <FileEdit className="size-4" /> Edit
                    </a>
                  </>
                )}
              </div>
              
              {item.genres?.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {item.genres.map((g: string) => (
                    <Link key={g} to="/" search={{ genre: g }} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground">
                      {g}
                    </Link>
                  ))}
                </div>
              )}
              <WatchParty titleId={item.id} onOpenPlayer={() => setPlayerOpen(true)} />
            </div>
          </div>
        </div>

        {playerOpen && (
          <div className="mt-8 relative z-10">
            <VideoPlayer
              sources={combinedSources}
              episodes={item.videos}
              itemId={item.id}
              activeSeason={activeSeason}
              activeEpisode={activeEpisode}
              onEpisodeChange={handleEpisodeChange}
              isFetchingAddons={fetchingAddons}
              telegramUrl={item.telegram_url}
              vkUrl={item.vk_url}
              title={item.title}
              poster={item.poster}
              synopsis={item.synopsis}
              type={item.type}
              onClose={() => setPlayerOpen(false)}
            />
          </div>
        )}

      </main>
    </div>
  );
}
