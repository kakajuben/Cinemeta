import { useState, useEffect } from "react";
import { Star, PlayCircle, Tv, Shell, Loader2 } from "lucide-react";
import { 
  getTrendingMovies, 
  getTrendingSeries, 
  getTrendingAnime, 
  type TrendingItem 
} from "@/lib/trending";

interface TrendingSectionProps {
  onSelect?: (id: string, type: "movie" | "series" | "anime") => void;
}

export function TrendingSection({ onSelect }: TrendingSectionProps) {
  const [activeTab, setActiveTab] = useState<"movie" | "series" | "anime">("movie");
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    
    const fetchers = {
      movie: getTrendingMovies,
      series: getTrendingSeries,
      anime: getTrendingAnime
    };

    fetchers[activeTab]()
      .then((data) => {
        if (isMounted) setItems(data);
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-card p-4 shadow-sm mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Star className="size-5 text-primary" />
          Trending Now
        </h2>
        <div className="flex gap-1 rounded-lg bg-muted p-1 overflow-x-auto">
          <button 
            onClick={() => setActiveTab("movie")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === "movie" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <PlayCircle className="size-4" /> Movies
          </button>
          <button 
            onClick={() => setActiveTab("series")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === "series" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Tv className="size-4" /> Series
          </button>
          <button 
            onClick={() => setActiveTab("anime")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === "anime" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Shell className="size-4" /> Anime
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="text-sm">Loading trends...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <div 
              key={item.id} 
              onClick={() => onSelect?.(item.id, item.type)}
              className="group relative flex cursor-pointer flex-col gap-2 overflow-hidden rounded-lg transition-transform hover:scale-105"
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted border border-border">
                {item.poster ? (
                  <img 
                    src={item.poster} 
                    alt={item.title} 
                    className="size-full object-cover transition-opacity duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
                    No Image
                  </div>
                )}
                <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/80 px-2 py-1 text-xs font-bold text-yellow-400 backdrop-blur-sm">
                  <Star className="size-3 fill-yellow-400" />
                  {item.rating}
                </div>
              </div>
              <div className="flex flex-col px-1">
                <span className="truncate text-sm font-semibold text-foreground" title={item.title}>
                  {item.title}
                </span>
                <span className="text-xs text-muted-foreground">{item.year || item.type}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
