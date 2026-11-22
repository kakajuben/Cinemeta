import { supabase } from "@/integrations/supabase/client";
import { fetchTmdbTrailersFn } from "./tmdb.functions";

export interface CatalogTrailer {
  id: string;
  originalUrl: string;
  embedUrl: string;
  title: string;
  thumbnail: string;
}

export function extractViId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(vi\d{7,10})/i);
  return match?.[1] ? match[1].toLowerCase() : null;
}

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

export function buildYouTubeTrailer(key: string): CatalogTrailer {
  return {
    id: key,
    originalUrl: `https://www.youtube.com/watch?v=${key}`,
    embedUrl: `https://www.youtube.com/embed/${key}?autoplay=1&rel=0`,
    title: "YouTube Trailer",
    thumbnail: `https://img.youtube.com/vi/${key}/hqdefault.jpg`,
  };
}

export function buildIMDbEmbedUrl(videoId: string): string {
  return `https://www.imdb.com/video/imdb/${videoId}/imdb/embed?autoplay=false`;
}

export function normalizeTrailer(trailer: unknown): CatalogTrailer | null {
  if (!trailer || typeof trailer !== 'object') return null;
  const t = trailer as Partial<CatalogTrailer>;
  if (!t.id || !t.embedUrl) return null;
  
  return {
    id: t.id,
    originalUrl: t.originalUrl || `https://www.imdb.com/video/${t.id}/`,
    embedUrl: t.embedUrl,
    title: t.title || "Trailer",
    thumbnail: t.thumbnail || "",
  };
}

export async function fetchVideoMetadata(videoId: string): Promise<Partial<CatalogTrailer> | null> {
  try {
    const { data, error } = await supabase.functions.invoke("fetch-video-meta", {
      body: { videoId }
    });
    if (!error && data && data.title) return data;
  } catch (e) {
    console.warn("Edge function failed, falling back to proxy scrape...");
  }

  try {
    const imdbUrl = `https://www.imdb.com/video/${videoId}/`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(imdbUrl)}`;
    
    const res = await fetch(proxyUrl);
    const json = await res.json();
    
    if (json.contents) {
      const html = json.contents;
      
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
      let title = titleMatch ? titleMatch[1] : `Trailer: ${videoId}`;
      title = title.replace(" - IMDb", "").trim();
      
      const thumbMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      const thumbnail = thumbMatch ? thumbMatch[1] : "";

      return {
        id: videoId,
        originalUrl: imdbUrl,
        embedUrl: buildIMDbEmbedUrl(videoId),
        title: title,
        thumbnail: thumbnail
      };
    }
  } catch (err) {
    console.error("Proxy scrape failed:", err);
  }

  return null;
}

export async function fetchTrailersFromGallery(imdbId: string, type: "movie" | "series" | "anime" = "movie"): Promise<CatalogTrailer[]> {
  return fetchTrailers(imdbId, type);
}

export async function fetchTrailers(imdbId: string, type: "movie" | "series" | "anime" = "movie"): Promise<CatalogTrailer[]> {
  const match = imdbId.match(/(tt\d{7,10})/i);
  const cleanId = match?.[1] ? match[1].toLowerCase() : null;
  if (!cleanId) return [];

  // TMDB lookups run server-side so the API key never reaches the browser.
  try {
    const trailers = await fetchTmdbTrailersFn({ data: { imdbId: cleanId } });
    return Array.isArray(trailers) ? trailers : [];
  } catch (err) {
    console.warn("TMDB fetch failed.", err);
    return [];
  }
}
