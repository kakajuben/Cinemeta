import { fetchTmdbStillsFn } from "./tmdb.functions";

// Episode still waterfall: TMDB official still (fetched server-side) -> MetaHub CDN -> (UI) series backdrop + badge
const memo = new Map<string, Promise<Record<string, string>>>();

export function cleanImdb(id?: string | null): string | null {
  return id?.match(/(tt\d{7,10})/i)?.[1]?.toLowerCase() ?? null;
}

export function episodeNumber(ep: unknown): number {
  const n = typeof ep === "number" ? ep : Number(String(ep ?? "").match(/\d+/)?.[0]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function metahubStill(imdbId: string, season: number, ep: number) {
  return `https://episodes.metahub.space/${imdbId}/${season}/${ep}/w780.jpg`;
}

/** Returns map "season:episode" -> TMDB still URL for the given seasons (lookups run server-side). */
export function fetchTmdbStills(imdbIdRaw: string, seasons: number[]): Promise<Record<string, string>> {
  const imdbId = cleanImdb(imdbIdRaw);
  if (!imdbId || seasons.length === 0) return Promise.resolve({});
  const key = `${imdbId}|${[...new Set(seasons)].sort().join(",")}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const p = fetchTmdbStillsFn({ data: { imdbId, seasons: [...new Set(seasons)] } })
    .then((out) => out ?? {})
    .catch(() => ({} as Record<string, string>));
  memo.set(key, p);
  return p;
}

/** Fills thumbnails: keeps real existing images, otherwise TMDB, otherwise MetaHub. */
export async function healEpisodeThumbnails<T extends { season?: unknown; episode?: unknown; thumbnail?: string | null }>(
  imdbIdRaw: string | null | undefined,
  videos: T[],
): Promise<T[]> {
  const imdbId = cleanImdb(imdbIdRaw);
  if (!imdbId || !videos.length) return videos;
  const needs = (t?: string | null) => !t || t.includes("episodes.metahub.space");
  const seasons = videos.filter((v) => needs(v.thumbnail)).map((v) => Number(v.season)).filter((s) => s > 0);
  const stills = seasons.length ? await fetchTmdbStills(imdbId, seasons) : {};
  return videos.map((v) => {
    if (!needs(v.thumbnail)) return v;
    const s = Number(v.season);
    const e = episodeNumber(v.episode);
    if (!s || !e) return v;
    return { ...v, thumbnail: stills[`${s}:${e}`] || v.thumbnail || metahubStill(imdbId, s, e) };
  });
}
