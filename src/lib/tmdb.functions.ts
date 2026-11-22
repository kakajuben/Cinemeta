// Server functions that proxy TMDB lookups so the API key never ships to the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicCatalogSeasons, isPublicCatalogTitle, tmdbStillsBySeason, tmdbTrailersByImdb } from "./tmdb.server";

const imdbIdSchema = z.string().regex(/^tt\d{7,10}$/i);

const stillsInput = z.object({
  imdbId: imdbIdSchema,
  seasons: z.array(z.number().int().min(1).max(100)).max(50),
});

export const fetchTmdbStillsFn = createServerFn({ method: "POST" })
  .inputValidator((data) => stillsInput.parse(data))
  .handler(async ({ data }) => {
    const imdbId = data.imdbId.toLowerCase();
    const databaseUrl = process.env["SUPABASE_URL"];
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!databaseUrl || !publishableKey) return {};
    const seasons = await getPublicCatalogSeasons(imdbId, databaseUrl, publishableKey, data.seasons);
    if (!seasons.length) return {};
    return tmdbStillsBySeason(imdbId, seasons);
  });

const trailersInput = z.object({ imdbId: imdbIdSchema });

export const fetchTmdbTrailersFn = createServerFn({ method: "POST" })
  .inputValidator((data) => trailersInput.parse(data))
  .handler(async ({ data }) => {
    const imdbId = data.imdbId.toLowerCase();
    const databaseUrl = process.env["SUPABASE_URL"];
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!databaseUrl || !publishableKey) return [];
    const isPublicTitle = await isPublicCatalogTitle(imdbId, databaseUrl, publishableKey);
    if (!isPublicTitle) return [];
    return tmdbTrailersByImdb(imdbId);
  });
