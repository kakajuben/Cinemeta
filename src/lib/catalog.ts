import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getTrendingMovies, getTrendingSeries, getTrendingAnime } from "@/lib/trending";
import { getCachedCatalog, setCachedCatalog, getCachedCatalogItem, clearCatalogCache } from "./catalogCache";
import { type CatalogTrailer, normalizeTrailer } from "./imdbTrailer";

export interface VideoSource {
  server: string;
  url: string;
  isAddon?: boolean;
  inAppUrl?: string;
  type?: string;
  downloadUrl?: string;
  vkDownloadUrl?: string;
  mirrorDownloadUrl?: string;
  otherUrl?: string;
  season?: number | null;
  episode?: string;
}

export interface CatalogItem {
  id: string;
  title: string;
  year: number | null;
  imdb_id: string | null;
  rating: string | null;
  poster: string | null;
  backdrop: string | null;
  synopsis: string | null;
  type: "movie" | "series" | "anime";
  stars: string[];
  genres: string[];
  sources: VideoSource[];
  videos: any[]; 
  trailers: CatalogTrailer[]; 
  telegram_url: string | null;
  vk_url: string | null;
  created_at: string;
  is_hidden?: boolean;
}

export interface CatalogFilterSearch {
  q?: string | undefined;
  star?: string | undefined;
  genre?: string | undefined;
  type?: CatalogItem["type"] | undefined;
}

export function filterCatalog(items: CatalogItem[], search: CatalogFilterSearch): CatalogItem[] {
  const query = search.q?.trim().toLowerCase();
  const star = search.star?.trim().toLowerCase();
  const genre = search.genre?.trim().toLowerCase();

  return items.filter((item) => {
    const stars = item.stars ?? [];
    const genres = item.genres ?? [];
    if (query) {
      const haystack = [item.title, item.synopsis ?? "", item.imdb_id ?? "", ...genres, ...stars].join(" ").toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (star && !stars.some((itemStar) => itemStar.toLowerCase() === star)) return false;
    if (genre && !genres.some((itemGenre) => itemGenre.toLowerCase() === genre)) return false;
    return !search.type || item.type === search.type;
  });
}

function normalize(row: Record<string, unknown>): CatalogItem {
  const sources = row['sources'];
  const videos = row['videos'];
  const rawTrailers = row['trailers'];
  
  const parsedTrailers = Array.isArray(rawTrailers) 
    ? rawTrailers.map(normalizeTrailer).filter((t): t is CatalogTrailer => t !== null)
    : [];

  return {
    ...(row as unknown as CatalogItem),
    stars: (row['stars'] as string[]) ?? [],
    genres: (row['genres'] as string[]) ?? [],
    sources: Array.isArray(sources) ? (sources as VideoSource[]) : [],
    videos: Array.isArray(videos) ? videos : [],
    trailers: parsedTrailers,
  };
}

export async function listCatalog(): Promise<CatalogItem[]> {
  const cachedItems = getCachedCatalog();
  const fetchFreshData = async () => {
    const { data, error } = await supabase.from("catalog_items").select("*").neq("is_hidden" as never, true).order("created_at", { ascending: false });
    if (error) throw error;
    const parsed = (data ?? []).map((r) => normalize(r as Record<string, unknown>));
    setCachedCatalog(parsed); 
    return parsed;
  };
  if (cachedItems && cachedItems.length > 0) {
    fetchFreshData().catch(console.warn);
    return cachedItems;
  }
  return await fetchFreshData();
}

export async function getAdminHybridCatalog(): Promise<CatalogItem[]> {
  const localItems = await listCatalog();
  try {
    const [movies, series, anime] = await Promise.all([getTrendingMovies(), getTrendingSeries(), getTrendingAnime()]);
    const allCinemeta = [...movies, ...series, ...anime];
    const merged = [...localItems];

    for (const t of allCinemeta) {
      if (!localItems.some(l => l.imdb_id === t.id)) {
        merged.push({
          id: t.id, imdb_id: t.id, title: t.title, poster: t.poster, rating: t.rating,
          type: t.type as "movie" | "series" | "anime", year: parseInt(t.year) || null,
          genres: ["Trending (Needs Links)"], stars: [], sources: [], videos: [], trailers: [],
          backdrop: t.poster, synopsis: "Streaming links not added yet.", telegram_url: "", vk_url: "",
          created_at: new Date().toISOString(),
        });
      }
    }
    return merged;
  } catch (e) {
    return localItems;
  }
}

export async function fetchMetadata(id: string) {
  if (id.startsWith("tt")) {
    let res = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${id}.json`);
    let data = await res.json();
    if (!data.meta) {
      res = await fetch(`https://v3-cinemeta.strem.io/meta/series/${id}.json`);
      data = await res.json();
    }
    if (!data.meta) throw new Error("Not found in Cinemeta");
    const m = data.meta;
    return {
      imdbId: id, title: m.name, year: m.year ? parseInt(m.year.split("-")[0]) : null,
      rating: m.imdbRating || "", poster: m.poster, backdrop: m.background || m.poster,
      synopsis: m.description, type: m.type === "series" ? "series" : "movie",
      stars: m.cast || [], genres: m.genres || [],
      episodes: m.videos ? m.videos.map((v: any) => ({ season: v.season, episode: v.episode })) : []
    };
  } else {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${id}`);
    const json = await res.json();
    if (!json.data) throw new Error("Not found in Jikan");
    const d = json.data;
    return {
      imdbId: id.toString(), title: d.title_english || d.title, year: d.year,
      rating: d.score?.toString() || "", poster: d.images?.jpg?.large_image_url || d.images?.jpg?.image_url,
      backdrop: d.trailer?.images?.maximum_image_url || d.images?.jpg?.large_image_url,
      synopsis: d.synopsis, type: "anime", stars: [], genres: d.genres ? d.genres.map((g: any) => g.name) : [],
      episodes: d.episodes ? Array.from({length: d.episodes}, (_, i) => ({ season: 1, episode: i + 1 })) : []
    };
  }
}

export async function getCatalogItem(id: string): Promise<CatalogItem | null> {
  const cachedItem = getCachedCatalogItem(id);
  if (cachedItem) return cachedItem;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

  if (isUuid) {
    const { data, error } = await supabase.from("catalog_items").select("*").eq("id", id).neq("is_hidden" as never, true).maybeSingle();
    if (error) throw error;
    if (data) return normalize(data as Record<string, unknown>);
  } else {
    const { data } = await supabase.from("catalog_items").select("*").eq("imdb_id", id).neq("is_hidden" as never, true).maybeSingle();
    if (data) return normalize(data as Record<string, unknown>);
  }

  if (id.startsWith("tt") || !isNaN(Number(id))) {
    try {
      const meta = await fetchMetadata(id);
      return {
        id: id, imdb_id: meta.imdbId, title: meta.title, year: meta.year, rating: meta.rating,
        poster: meta.poster, backdrop: meta.backdrop, synopsis: meta.synopsis, type: meta.type as "movie" | "series" | "anime",
        stars: meta.stars, genres: meta.genres, sources: [], videos: [], trailers: [], 
        telegram_url: "", vk_url: "", created_at: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
  return null;
}

export type CatalogItemInput = Omit<CatalogItem, "id" | "created_at"> & { id?: string };

export async function saveCatalogItem(input: CatalogItemInput) {
  const payload = {
    title: input.title, year: input.year, imdb_id: input.imdb_id, rating: input.rating,
    poster: input.poster, backdrop: input.backdrop, synopsis: input.synopsis, type: input.type,
    stars: input.stars, genres: input.genres, sources: input.sources as unknown as Json,
    videos: input.videos as unknown as Json, trailers: input.trailers as unknown as Json ?? [], 
    telegram_url: input.telegram_url, vk_url: input.vk_url,
  };

  if (input.id) {
    const { error } = await supabase.from("catalog_items").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("catalog_items").insert(payload);
    if (error) throw error;
  }
  clearCatalogCache();
}

export async function deleteCatalogItem(id: string) {
  const { error } = await supabase.from("catalog_items").update({ is_hidden: true } as never).eq("id", id);
  if (error) throw error;
  clearCatalogCache();
}
