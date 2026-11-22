import { cachedFetch } from "@/lib/net";

export interface TrendingItem {
  id: string;
  title: string;
  poster: string;
  rating: string;
  type: "movie" | "series" | "anime";
  year: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCinemeta(list: any, type: "movie" | "series"): TrendingItem[] {
  if (!Array.isArray(list)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return list.slice(0, 20).filter((m: any) => m?.id).map((m: any) => ({
    id: String(m.id),
    title: m.name || "Unknown",
    poster: m.poster || "",
    rating: m.imdbRating || "N/A",
    type,
    year: String(m.releaseInfo || m.year || ""),
  }));
}

export async function getTrendingMovies(): Promise<TrendingItem[]> {
  const res = await cachedFetch("https://v3-cinemeta.strem.io/catalog/movie/top.json");
  if (!res.ok) return [];
  const data = await res.json();
  return mapCinemeta(data?.metas, "movie");
}

export async function getTrendingSeries(): Promise<TrendingItem[]> {
  const res = await cachedFetch("https://v3-cinemeta.strem.io/catalog/series/top.json");
  if (!res.ok) return [];
  const data = await res.json();
  return mapCinemeta(data?.metas, "series");
}

export async function getTrendingAnime(): Promise<TrendingItem[]> {
  const res = await cachedFetch("https://api.jikan.moe/v4/top/anime?filter=airing&limit=20");
  if (!res.ok) return [];
  const data = await res.json();
  const list = data?.data;
  if (!Array.isArray(list)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return list.filter((m: any) => m?.mal_id != null).map((m: any) => ({
    id: String(m.mal_id),
    title: m.title_english || m.title || "Unknown",
    poster: m.images?.jpg?.image_url || "",
    rating: m.score ? String(m.score) : "N/A",
    type: "anime" as const,
    year: m.year ? String(m.year) : "",
  }));
}
