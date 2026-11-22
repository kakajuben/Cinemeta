import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PullToRefresh } from "@/components/catalog/PullToRefresh";
import { listCatalog, filterCatalog, type CatalogFilterSearch } from "@/lib/catalog";
import { CatalogRow } from "@/components/CatalogRow";
import { CatalogHero } from "@/components/catalog/CatalogHero";
import { FilteredGrid } from "@/components/catalog/FilteredGrid";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { useWatchlist } from "@/hooks/useWatchlist";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  
  // Get active filters from the URL (e.g. ?type=movie)
  const searchParams = Route.useSearch() as CatalogFilterSearch;
  const { data, isLoading } = useQuery({ queryKey: ["catalog"], queryFn: listCatalog });
  const queryClient = useQueryClient();
  const [minRating, setMinRating] = useState(0);
  const [yearRange, setYearRange] = useState("all");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="px-4 pt-24 sm:pt-32">
          <div className="skeleton mx-auto mb-10 h-10 w-3/4 max-w-2xl rounded-xl" />
          <div className="mx-auto flex max-w-6xl gap-4 overflow-hidden py-4">
            <div className="skeleton h-64 w-44 shrink-0 rounded-2xl" />
            <div className="skeleton h-64 w-44 shrink-0 rounded-2xl" />
            <div className="skeleton h-64 w-44 shrink-0 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  const allItems = data ?? [];

  // Filter the catalog if a search or category parameter exists
  const isSearch = Boolean(searchParams.q);
  const isTypeFilter = Boolean(searchParams.type);
  const isGenreFilter = Boolean(searchParams.genre);
  const isFiltering = isSearch || isTypeFilter || isGenreFilter || Boolean(searchParams.star);
  
  const yearOk = (y: number | null) => {
    if (yearRange === "all") return true;
    if (!y) return false;
    if (yearRange === "new") return y >= 2025;
    if (yearRange === "2020") return y >= 2020 && y <= 2024;
    if (yearRange === "2010") return y >= 2010 && y <= 2019;
    return y < 2010;
  };
  const filteredData = (isFiltering ? filterCatalog(allItems, searchParams) : allItems).filter(
    (i) => (minRating === 0 || (parseFloat(i.rating ?? "") || 0) >= minRating) && yearOk(i.year),
  );
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`;

  // For Normal Homepage (No Filters)
  const movies = allItems.filter((i) => i.type === "movie");
  const series = allItems.filter((i) => i.type === "series");
  const anime = allItems.filter((i) => i.type === "anime");
  const ranked = [...allItems].slice(0, 10);
  const heroItem = ranked[0];

  // Dynamically extract all unique genres for the Normal Homepage dynamic rows
  const globalGenreCounts = allItems.reduce((acc, item) => {
    item.genres?.forEach((g) => {
      acc[g] = (acc[g] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);
  const sortedGlobalGenres = Object.entries(globalGenreCounts)
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0]);

  // Dynamically extract unique genres specifically for the active Type (Pill Bar)
  const activeTypeItems = isTypeFilter ? allItems.filter(i => i.type === searchParams.type) : [];
  const typeGenreCounts = activeTypeItems.reduce((acc, item) => {
    item.genres?.forEach((g) => {
      acc[g] = (acc[g] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);
  const activeTypeGenres = Object.entries(typeGenreCounts)
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0]);

  return (
    <div className="min-h-screen pb-20">
      <SiteHeader />

      {/* Only show Hero if not filtering/searching */}
      {!isFiltering && heroItem && (
        <CatalogHero
          item={heroItem}
          isSaved={isInWatchlist(heroItem.id)}
          isAdmin={isAdmin}
          onToggleWatchlist={() => void toggleWatchlist(heroItem.id)}
        />
      )}

      <PullToRefresh onRefresh={() => queryClient.invalidateQueries({ queryKey: ["catalog"] })}>
      <main className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-8 sm:pt-8">
        {/* If filtering (e.g. clicked "Movies"), show the grid and filter headers */}
        {isFiltering ? (
          <div className="mt-8 sm:mt-12">
            {isSearch ? (
              <div className="mb-6 flex items-center gap-3">
                <span className="h-7 w-1 rounded-full bg-primary shadow-[0_0_14px_var(--primary)]" />
                <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Results for "{searchParams.q}"
                </h2>
              </div>
            ) : (
              <div className="mb-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="h-7 w-1 rounded-full bg-primary shadow-[0_0_14px_var(--primary)]" />
                  <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl capitalize">
                    {searchParams.type === "series" ? "TV Series" : searchParams.type}
                  </h2>
                </div>
                
                {/* Frosted Glass Genre Pill Bar */}
                {activeTypeGenres.length > 0 && (
                  <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-md">
                    <button
                      onClick={() => navigate({ to: "/", search: { type: searchParams.type } })}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                        !searchParams.genre 
                          ? "bg-white text-black shadow-md shadow-white/10" 
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      All
                    </button>
                    {activeTypeGenres.map((g) => (
                      <button
                        key={g}
                        onClick={() => navigate({ to: "/", search: { type: searchParams.type, genre: g } })}
                        className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                          searchParams.genre === g 
                            ? "bg-white text-black shadow-md shadow-white/10" 
                            : "text-white/70 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mb-5 flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {[0, 8, 7, 6].map((r) => (
                  <button key={r} onClick={() => setMinRating(r)} className={chip(minRating === r)}>{r === 0 ? "All ratings" : `⭐ ${r}.0+`}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {[["all", "All years"], ["new", "2025–2026"], ["2020", "2020–2024"], ["2010", "2010s"], ["old", "Classics"]].map(([k, l]) => (
                  <button key={k} onClick={() => setYearRange(k!)} className={chip(yearRange === k)}>{l}</button>
                ))}
              </div>
            </div>
            {filteredData.length > 0 ? (
              <FilteredGrid items={filteredData} />
            ) : (
              <p className="mt-10 text-center text-sm text-muted-foreground">No titles found.</p>
            )}
          </div>
        ) : (
          /* Normal Homepage with Premium Rows */
          <>
            <CatalogRow title="Recently added" items={ranked} variant="ranked" />
            {movies.length > 0 && <CatalogRow title="Latest Movies" items={movies.slice(0, 15)} />}
            {series.length > 0 && <CatalogRow title="Latest TV Series" items={series.slice(0, 15)} />}
            {anime.length > 0 && <CatalogRow title="Latest Anime" items={anime.slice(0, 15)} />}
            
            {sortedGlobalGenres.map((genre) => {
              const genreItems = allItems.filter((i) => i.genres?.includes(genre)).slice(0, 15);
              if (genreItems.length === 0) return null;
              return <CatalogRow key={genre} title={genre} items={genreItems} />;
            })}
          </>
        )}
      </main>
      </PullToRefresh>
    </div>
  );
}
