import { supabase } from "@/integrations/supabase/client";
// Ensure your net.ts handles native caching. If it doesn't, standard fetch with headers is safer.
import { cachedFetch } from "./net"; 
import type { VideoSource } from "./catalog";

export interface StremioAddon {
  id: string;
  name: string;
  manifest_url: string;
  icon_url?: string | null;
}

export interface StremioCatalogItem {
  id: string;
  type: "movie" | "series" | "anime";
  name: string;
  poster?: string;
  genres?: string[];
  addonName?: string;
  year?: string | number;
  releaseInfo?: string;
}

// Reusable fetch wrapper that enforces edge caching headers
async function fetchWithEdgeCache(url: string, timeoutMs: number = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Tells Vercel/Cloudflare edge nodes to cache this response for 24 hours (86400s)
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600'
      }
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

export async function listInstalledAddons(): Promise<StremioAddon[]> {
  try {
    const { data, error } = await supabase
      .from("stremio_addons")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error("Failed to load addons from Supabase.", e);
    return [];
  }
}

export async function installAddon(manifestUrl: string) {
  const cleanUrl = manifestUrl.trim();
  const res = await cachedFetch(cleanUrl);
  if (!res.ok) throw new Error("Invalid addon URL or CORS blocked.");

  const manifest = await res.json();

  if (!manifest.name || !manifest.id) {
    throw new Error("Invalid manifest: Missing addon id or name.");
  }

  const { error } = await supabase.from("stremio_addons").insert({
    name: manifest.name,
    manifest_url: cleanUrl,
    icon_url: manifest.logo || manifest.icon || null,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("This addon is already installed.");
    }
    throw error;
  }
}

export async function uninstallAddon(id: string) {
  const { error } = await supabase.from("stremio_addons").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchAddonStreams(
  imdbId?: string | null,
  type?: string | null,
  season?: number | null,
  episode?: string | number | null
): Promise<VideoSource[]> {
  if (!imdbId) return [];

  const installedAddons = await listInstalledAddons();
  if (installedAddons.length === 0) return [];

  const hasEpData = season != null || episode != null;
  const rawType = String(type || "").toLowerCase();
  let targetType = "movie";

  if (hasEpData || rawType.includes("series") || rawType.includes("anime") || rawType.includes("tv") || rawType.includes("show")) {
    targetType = "series";
  }

  let sNum = typeof season === "number" && season >= 0 ? season : 1;
  let epNum = 1;

  if (typeof episode === "number" && episode >= 0) {
    epNum = episode;
  } else if (typeof episode === "string") {
    const parsed = parseInt(episode.replace(/\D/g, ""), 10);
    if (!isNaN(parsed) && parsed >= 0) epNum = parsed;
  }

  const streamId = targetType === "movie" ? imdbId : `${imdbId}:${sNum}:${epNum}`;
  const epTag = targetType === "series" ? `(S${sNum} E${epNum})` : ``;

  const allStreams: any[] = [];

  const fetchPromises = installedAddons.map(async (addon) => {
    try {
      const baseUrl = addon.manifest_url.replace(/\/manifest\.json$/i, "");
      const res = await fetchWithEdgeCache(`${baseUrl}/stream/${targetType}/${streamId}.json`);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.streams)) {
          const formatted = data.streams
            .map((s: any, idx: number) => {
              const streamName = s.name || addon.name;
              const desc = s.description ? s.description.split("\n")[0] : `Stream ${idx + 1}`;

              if (s.infoHash) {
                const magnet = `magnet:?xt=urn:btih:${s.infoHash}`;
                return {
                  server: `🧲 [Torrent] ${streamName} ${epTag}`.trim().substring(0, 45),
                  url: magnet,
                  type: "Magnet",
                  downloadUrl: magnet,
                  season: targetType === "series" ? sNum : null,
                  episode: targetType === "series" ? `Episode ${epNum}` : undefined,
                  isAddon: true,
                };
              }
              if (s.ytId) {
                return {
                  server: `📺 [YouTube] ${streamName} ${epTag}`.trim().substring(0, 45),
                  url: `https://www.youtube.com/embed/${s.ytId}`,
                  inAppUrl: `https://www.youtube.com/embed/${s.ytId}`,
                  externalUrl: `https://youtube.com/watch?v=${s.ytId}`,
                  type: "Auto",
                  season: targetType === "series" ? sNum : null,
                  episode: targetType === "series" ? `Episode ${epNum}` : undefined,
                  isAddon: true,
                };
              }
              if (s.url || s.externalUrl) {
                const streamUrl = s.url || s.externalUrl;
                return {
                  server: `⚡ [Addon] ${streamName} ${epTag}`.trim().substring(0, 45),
                  url: streamUrl,
                  inAppUrl: streamUrl,
                  externalUrl: s.externalUrl || streamUrl,
                  isAddon: true,
                  type: "Auto",
                  season: targetType === "series" ? sNum : null,
                  episode: targetType === "series" ? `Episode ${epNum}` : undefined,
                };
              }
              return null;
            })
            .filter((item: any) => item !== null);

          allStreams.push(...formatted);
        }
      }
    } catch {
      // Ignore unresponsive addons
    }
  });

  await Promise.allSettled(fetchPromises);

  return allStreams.sort((a, b) => {
    if (a.type === "Magnet" && b.type !== "Magnet") return 1;
    if (a.type !== "Magnet" && b.type === "Magnet") return -1;
    return 0;
  }) as VideoSource[];
}

export async function fetchInstalledAddonCatalogs(): Promise<StremioCatalogItem[]> {
  const installedAddons = await listInstalledAddons();
  if (installedAddons.length === 0) return [];

  const catalogItems: StremioCatalogItem[] = [];
  const fetchPromises = installedAddons.map(async (addon) => {
    try {
      const cleanUrl = addon.manifest_url.trim();
      const manifestRes = await fetchWithEdgeCache(cleanUrl);
      if (!manifestRes.ok) return;

      const manifest = await manifestRes.json();
      const baseUrl = cleanUrl.replace(/\/manifest\.json$/i, "");

      if (Array.isArray(manifest.catalogs)) {
        for (const cat of manifest.catalogs) {
          if (cat.type === "movie" || cat.type === "series" || cat.type === "anime") {
            const catRes = await fetchWithEdgeCache(`${baseUrl}/catalog/${cat.type}/${cat.id}.json`);
            if (catRes.ok) {
              const catData = await catRes.json();
              if (Array.isArray(catData.metas)) {
                const metasWithAddon = catData.metas.map((m: any) => ({
                  ...m,
                  addonName: addon.name
                }));
                catalogItems.push(...metasWithAddon);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Failed loading catalog for addon: ${addon.name}`, err);
    }
  });

  await Promise.allSettled(fetchPromises);

  const seen = new Set<string>();
  return catalogItems.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export async function fetchExternalMeta(id: string): Promise<any> {
  try {
    let meta = null;
    let videos: any[] = [];

    const tmdbBaseUrl = "https://94c8cb9f702d-tmdb-addon.baby-beamup.club/N4IgTgDgJgRgsgUygSwIYBUCeEEGcQBcoEA9rgC4JiHlgCuCANCADYkDmJhAZqi7kxAxUAYwDWUMCQg8+AgL7Ny00hSq4xCTIRAglKspTC4AwiQB23ZO0LFDVLDh2qjAWigJedFuT0gKmCwIOgC2JB5g5n7kABZ0ITDmqMgsAEKoUOwIAApkyOTIFjrKEK5g1jG+SnEJSSnpmQgAysgAXsEE-iF8LNE1iclpLHTUBLz8CIog5CGwAIIQyADSWjqoAGwArMIA7ACMCABMhwAMe6jHUOd7UADMUCcw3ACcABwiGwAsUH4QUgBuyA8AElZjBgT9OrQGH4wAhyCNzKDYBDivRgswWKhzOw6KgsjoEOZXABVJp+AS4XCFJGQkCHPabBA7U7rdafTabbgiBDCT6HKCfT4iTYiES3e6bKDrZ4iZ6HDLsim0BCoELIHGEADaIEsAA8-JYxH41TJmKhyGaQCJyPhmO0MSAYhQ-CJ6H4QuxeswYqhtMwoE4ALrMD7kPgcfAELWgIHFMEAOixlBdSmwHRAYUBjqSIQzABkLXhyAACABKCCCqEpFJiJAA7sDzAAJEh5mjoxSxukzWBJoup6bpnQCcp4Q1qgsD0sVqs15i4OuNlttjrQyaMbvxvsq8woTVppydLPIHOTnToOF7jU2BdLput9sEdddkBxqGJ3f729Do-+Kinnaurnp0l5Et+tYNg+q4dgwr7vtMn7SNEw7HiQ2YTk+IC5BA3ioNQd5QSuT4vpub49khVrkKh-5jkBuYZjheEEf497EWunZkQhvYwAmmCqix1F-ieZ5YQAmgJkHLo+HFwVxFF9vx+EoX+o6AZhGYScphHSTBz6cVuH59liOJ4gSh4ZiJGk6IWpn4o6i5ETJsEboZiHGdiuL2SpGZqeOzAMTZnlmQ5bHOfpcEhta1bkGYdDmL4BCbDpcxZGWFo3k2ADiRJwlG0zon4RKoDAQSpQg6UFJqnTjAIUnlZVN4AOr5DEyIwI11UgLVDm0MgNoVuwNIAGIpEYOg9X4KBDeGLCzqqAijT4VCyBM8hAA";
    
    let tmdbRes = await fetchWithEdgeCache(`${tmdbBaseUrl}/meta/movie/${id}.json`, 6000).catch(() => null);
    let data = tmdbRes ? await tmdbRes.json().catch(() => null) : null;

    if (!data?.meta || data.meta.type !== "movie") {
      tmdbRes = await fetchWithEdgeCache(`${tmdbBaseUrl}/meta/series/${id}.json`, 6000).catch(() => null);
      data = tmdbRes ? await tmdbRes.json().catch(() => null) : null;
    }

    if (data?.meta) {
      meta = data.meta;
      videos = Array.isArray(meta.videos) ? meta.videos : [];
    }

    if (!meta || videos.length <= 1) {
      let cineRes = await fetchWithEdgeCache(`https://v3-cinemeta.strem.io/meta/movie/${id}.json`, 6000).catch(() => null);
      let cineData = cineRes ? await cineRes.json().catch(() => null) : null;

      if (!cineData?.meta || cineData.meta.type !== "movie") {
        cineRes = await fetchWithEdgeCache(`https://v3-cinemeta.strem.io/meta/series/${id}.json`, 6000).catch(() => null);
        cineData = cineRes ? await cineRes.json().catch(() => null) : null;
      }
      if (cineData?.meta) {
        meta = cineData.meta;
        if (Array.isArray(cineData.meta.videos) && cineData.meta.videos.length > videos.length) {
          videos = cineData.meta.videos;
        }
      }
    }

    if (meta) {
      const isSeries = meta.type === "series" || videos.length > 0;

      const formattedVideos = videos.map((v: any) => {
        const s = v.season !== undefined && v.season !== null ? Number(v.season) : 1;
        const e = v.episode !== undefined && v.episode !== null ? Number(v.episode) : 1;
        
        return {
          id: v.id || `${s}-${e}`,
          season: s,
          episode: e,
          title: v.name || `Episode ${e}`,
          released: v.released || null,
          thumbnail: v.thumbnail || null,
          description: v.description || v.overview || null,
        };
      });

      formattedVideos.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
      });

      const placeholderSources: VideoSource[] = formattedVideos.map((v: any) => ({
        server: `Episode ${v.episode}`,
        url: "",
        type: "Auto",
        season: v.season,
        episode: `Episode ${v.episode}`,
      }));

      return {
        id: meta.id,
        imdb_id: meta.id,
        title: meta.name,
        type: isSeries ? "series" : "movie",
        year: meta.year ? parseInt(meta.year, 10) : null,
        rating: meta.imdbRating ? parseFloat(meta.imdbRating) : null,
        synopsis: meta.description,
        poster: meta.poster,
        backdrop: meta.background,
        genres: meta.genres || [],
        videos: formattedVideos,
        sources: placeholderSources,
        isExternal: true,
      };
    }
  } catch (e) {
    console.error("Failed to fetch external meta", e);
  }
  return null;
}
