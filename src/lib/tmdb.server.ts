// Server-only TMDB helper. Reads the TMDB_API_KEY secret inside handler-time
// functions — never import this module from client code.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CatalogTrailer } from "./imdbTrailer";

const TMDB_BASE = "https://api.themoviedb.org/3";

/** Only allow upstream queries for public titles and seasons stored in catalog episodes. */
export async function getPublicCatalogSeasons(
  imdbId: string,
  databaseUrl: string,
  publishableKey: string,
  requestedSeasons: number[],
): Promise<number[]> {
  const supabase = createClient<Database>(databaseUrl, publishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(
          typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
        );
        if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        if (publishableKey.startsWith("sb_") && headers.get("Authorization") === `Bearer ${publishableKey}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", publishableKey);
        return fetch(input, { ...init, headers });
      },
    },
  });

  const { data, error } = await supabase
    .from("catalog_items")
    .select("videos")
    .eq("imdb_id", imdbId)
    .eq("is_hidden", false)
    .limit(1)
    .maybeSingle();

  if (error || !data || !Array.isArray(data.videos)) return [];

  const catalogSeasons = new Set<number>();
  for (const episode of data.videos) {
    if (episode && typeof episode === "object" && !Array.isArray(episode) && "season" in episode) {
      const season = episode["season"];
      if (typeof season === "number" && Number.isInteger(season) && season >= 1 && season <= 100) {
        catalogSeasons.add(season);
      }
    }
  }

  return [...new Set(requestedSeasons)].filter((season) => catalogSeasons.has(season)).slice(0, 30);
}

/** Confirm the title is visible in the public catalog before any TMDB trailer lookup. */
export async function isPublicCatalogTitle(
  imdbId: string,
  databaseUrl: string,
  publishableKey: string,
): Promise<boolean> {
  const supabase = createClient<Database>(databaseUrl, publishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(
          typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
        );
        if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        if (publishableKey.startsWith("sb_") && headers.get("Authorization") === `Bearer ${publishableKey}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", publishableKey);
        return fetch(input, { ...init, headers });
      },
    },
  });

  const { data, error } = await supabase
    .from("catalog_items")
    .select("id")
    .eq("imdb_id", imdbId)
    .eq("is_hidden", false)
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data);
}

async function tmdbJson(path: string, query = ""): Promise<any | null> {
  const key = process.env["TMDB_API_KEY"];
  if (!key) return null;
  try {
    const res = await fetch(`${TMDB_BASE}${path}?api_key=${key}${query}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Returns map "season:episode" -> official still URL. Empty map when the key is missing or lookups fail. */
export async function tmdbStillsBySeason(imdbId: string, seasons: number[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const find = await tmdbJson(`/find/${imdbId}`, "&external_source=imdb_id");
  const tvId = find?.tv_results?.[0]?.id;
  if (!tvId) return out;
  const unique = [...new Set(seasons)].slice(0, 30);
  const results = await Promise.all(
    unique.map(async (s) => {
      const j = await tmdbJson(`/tv/${tvId}/season/${s}`);
      const stills: Record<string, string> = {};
      for (const e of j?.episodes ?? []) {
        if (e?.still_path) stills[`${s}:${e.episode_number}`] = `https://image.tmdb.org/t/p/w780${e.still_path}`;
      }
      return stills;
    }),
  );
  for (const r of results) Object.assign(out, r);
  return out;
}

/** Returns YouTube trailers for an IMDb id via TMDB. Empty array when the key is missing or lookups fail. */
export async function tmdbTrailersByImdb(imdbId: string): Promise<CatalogTrailer[]> {
  const find = await tmdbJson(`/find/${imdbId}`, "&external_source=imdb_id");
  const tmdbId = find?.movie_results?.[0]?.id || find?.tv_results?.[0]?.id;
  const mediaType = find?.movie_results?.[0] ? "movie" : "tv";
  if (!tmdbId) return [];
  const vidData = await tmdbJson(`/${mediaType}/${tmdbId}/videos`);
  if (!vidData?.results || !Array.isArray(vidData.results)) return [];
  return vidData.results
    .filter((v: any) => v.site === "YouTube" && v.type === "Trailer")
    .map((v: any) => ({
      id: v.key,
      originalUrl: `https://www.youtube.com/watch?v=${v.key}`,
      embedUrl: `https://www.youtube.com/embed/${v.key}?autoplay=1&rel=0`,
      title: v.name || "Official Trailer",
      thumbnail: `https://img.youtube.com/vi/${v.key}/maxresdefault.jpg`,
    }));
}
