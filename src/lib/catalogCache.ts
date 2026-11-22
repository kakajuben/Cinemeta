import type { CatalogItem } from "@/lib/catalog";

const CACHE_KEY = "kino_catalog_cache_v2";
const TIME_KEY = "kino_catalog_time_v2";

export const getCachedCatalog = (): CatalogItem[] | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch (error) {
    console.warn("Failed to parse catalog cache", error);
    return null;
  }
};

export const setCachedCatalog = (items: CatalogItem[]): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(items));
    window.localStorage.setItem(TIME_KEY, Date.now().toString());
  } catch (error) {
    // Gracefully handle quota exceeded errors (e.g., if the user's storage is full)
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn("Local storage quota exceeded, clearing cache to save new data.");
      clearCatalogCache();
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(items));
        window.localStorage.setItem(TIME_KEY, Date.now().toString());
      } catch (retryError) {
        console.warn("Still failing after clear, skipping cache.", retryError);
      }
    } else {
      console.warn("Failed to set catalog cache", error);
    }
  }
};

export const getCachedCatalogItem = (id: string): CatalogItem | null => {
  const catalog = getCachedCatalog();
  if (!catalog) return null;
  
  return catalog.find((item) => item.id === id || item.imdb_id === id) || null;
};

export const clearCatalogCache = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
    window.localStorage.removeItem(TIME_KEY);
  } catch (error) {
    console.warn("Failed to clear catalog cache", error);
  }
};
