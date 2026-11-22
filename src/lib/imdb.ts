import { cachedFetch } from "./net";

export interface ImdbEpisode {
  id?: string;
  season: number;
  episode: string;
  title?: string;
  thumbnail?: string;
  released?: string;
  description?: string;
}

export interface ImdbMetadata {
  imdbId: string;
  title: string;
  year: number | null;
  rating: string;
  poster: string;
  backdrop: string;
  synopsis: string;
  type: "movie" | "series" | "anime";
  genres: string[];
  stars: string[];
  totalSeasons: number;
  episodes: ImdbEpisode[];
}

export function extractImdbId(input: string): string | null {
  const match = input.match(/tt\d{7,10}/i);
  return match ? match[0] : null;
}

// Fallback for extremely old/niche shows if TMDB fails
async function fetchOmdbSeasonEpisodes(
  imdbId: string,
  season: number,
  apiKey: string,
): Promise<ImdbEpisode[]> {
  try {
    const res = await cachedFetch(`https://www.omdbapi.com/?i=${imdbId}&Season=${season}&apikey=${apiKey}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    if (data.Response === "False" || !Array.isArray(data.Episodes)) return [];
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.Episodes.map((ep: any, idx: number) => {
      const num = ep.Episode ?? String(idx + 1);
      const padded = num.padStart(2, "0");
      const title = ep.Title && ep.Title !== "N/A" ? ep.Title : "";
      const epName = title ? ` — ${title}` : "";
      return { 
        season, 
        episode: `Episode ${padded}${epName}`,
        title,
        released: ep.Released && ep.Released !== "N/A" ? ep.Released : undefined
      };
    });
  } catch {
    return [];
  }
}

export async function fetchImdbDetails(
  imdbUrlOrId: string,
  apiKey = "trilogy",
): Promise<ImdbMetadata> {
  const imdbId = extractImdbId(imdbUrlOrId);
  if (!imdbId) {
    throw new Error("Invalid IMDb URL or ID. Example: https://www.imdb.com/title/tt0944947/");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let meta: any = null;
  let type: "movie" | "series" | "anime" = "series";

  // --- ENGINE 1: TMDB Addon (Primary - Flawless for new K-Dramas & Series) ---
  try {
    const tmdbRes = await cachedFetch(`https://tmdb-addon.strem.fun/meta/series/${imdbId}.json`);
    if (tmdbRes.ok) {
      const data = await tmdbRes.json();
      if (data?.meta) {
        meta = data.meta;
        type = "series";
      }
    }
    
    if (!meta) {
      const tmdbRes2 = await cachedFetch(`https://tmdb-addon.strem.fun/meta/movie/${imdbId}.json`);
      if (tmdbRes2.ok) {
        const data = await tmdbRes2.json();
        if (data?.meta) {
          meta = data.meta;
          type = "movie";
        }
      }
    }
  } catch (e) {
    console.warn("TMDB Addon failed, falling back...");
  }

  // --- ENGINE 2: Cinemeta (Secondary Fallback) ---
  if (!meta) {
    try {
      const cineRes = await cachedFetch(`https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`);
      if (cineRes.ok) {
        const data = await cineRes.json();
        // Strict check to block the known Mary-Kate cache bug
        if (data?.meta && !data.meta.name.includes("Mary-Kate")) {
          meta = data.meta;
          type = "series";
        }
      }

      if (!meta) {
        const cineRes2 = await cachedFetch(`https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`);
        if (cineRes2.ok) {
          const data = await cineRes2.json();
          if (data?.meta && !data.meta.name.includes("Mary-Kate")) {
            meta = data.meta;
            type = "movie";
          }
        }
      }
    } catch (e) {
      console.warn("Cinemeta failed, falling back...");
    }
  }

  // --- ENGINE 3: OMDB (Ultimate Fallback) ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let omdbData: any = null;
  if (!meta) {
    const omdbRes = await cachedFetch(`https://www.omdbapi.com/?i=${imdbId}&plot=full&apikey=${apiKey}`);
    omdbData = await omdbRes.json();
    if (omdbData.Response === "False") {
      throw new Error("Could not find data for this ID across TMDB, Cinemeta, or OMDB.");
    }
  }

  // Data Extraction & Formatting
  const title = meta ? meta.name : omdbData?.Title;
  const yearRaw = meta ? meta.year : omdbData?.Year;
  const year = yearRaw ? parseInt(String(yearRaw).split("-")[0] ?? "", 10) : null;
  const rating = meta?.imdbRating || (omdbData?.imdbRating !== "N/A" ? omdbData?.imdbRating : "");
  const poster = meta?.poster || (omdbData?.Poster !== "N/A" ? omdbData?.Poster : "");
  const backdrop = meta?.background || meta?.poster || poster;
  const synopsis = meta?.description || (omdbData?.Plot !== "N/A" ? omdbData?.Plot : "");
  
  let genres: string[] = meta?.genres || [];
  if (genres.length === 0 && omdbData?.Genre && omdbData.Genre !== "N/A") {
    genres = omdbData.Genre.split(",").map((g: string) => g.trim());
  }

  let stars: string[] = meta?.cast || [];
  if (stars.length === 0 && omdbData?.Actors && omdbData.Actors !== "N/A") {
    stars = omdbData.Actors.split(",").map((s: string) => s.trim());
  }

  // Final Type assignment (Anime detection)
  if (genres.some((g) => g.toLowerCase() === "animation" || g.toLowerCase() === "anime")) {
    type = "anime";
  } else if (!meta && omdbData?.Type) {
    type = omdbData.Type === "series" ? "series" : "movie";
  }

  // Episode Extraction
  const episodes: ImdbEpisode[] = [];
  let totalSeasons = 0;

  if (type === "series" || type === "anime") {
    if (meta?.videos && Array.isArray(meta.videos) && meta.videos.length > 0) {
      for (const vid of meta.videos) {
        const sNum = Number(vid.season);
        const eNum = Number(vid.episode);
        
        if (!isNaN(sNum) && sNum > 0 && !isNaN(eNum) && eNum > 0) {
          if (sNum > totalSeasons) {
            totalSeasons = sNum;
          }
          const numStr = String(eNum).padStart(2, "0");
          const titleText = vid.name || vid.title || "";
          
          // Generate a MetaHub thumbnail fallback proactively during database save/fetch if none is provided
          let thumb = vid.thumbnail || "";
          if (!thumb && imdbId) {
            thumb = `https://episodes.metahub.space/${imdbId}/${sNum}/${eNum}/w780.jpg`;
          }

          episodes.push({
            id: vid.id,
            season: sNum,
            episode: `Episode ${numStr}${titleText ? ` — ${titleText}` : ""}`,
            title: titleText,
            thumbnail: thumb,
            released: vid.released,
            description: vid.description || vid.overview,
          });
        }
      }
    } 
    
    // If episodes are missing entirely, fallback to querying OMDB season by season
    if (episodes.length === 0) {
      if (!omdbData) {
        const oRes = await cachedFetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${apiKey}`);
        omdbData = await oRes.json();
      }
      totalSeasons = parseInt(omdbData?.totalSeasons || "0", 10);
      
      if (totalSeasons > 0) {
        const seasons = Array.from({ length: Math.min(totalSeasons, 20) }, (_, i) => i + 1);
        const results = await Promise.all(seasons.map(s => fetchOmdbSeasonEpisodes(imdbId, s, apiKey)));
        for (const list of results) episodes.push(...list);
      }
    }
  }

  if (episodes.length > 0 && imdbId) {
    try {
      const { healEpisodeThumbnails } = await import("./episodeStills");
      const healed = await healEpisodeThumbnails(imdbId, episodes);
      episodes.splice(0, episodes.length, ...healed);
    } catch { /* keep existing */ }
  }

  return {
    imdbId,
    title,
    year,
    rating,
    poster,
    backdrop,
    synopsis,
    type,
    genres,
    stars,
    totalSeasons,
    episodes,
  };
}
