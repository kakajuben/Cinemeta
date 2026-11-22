import { sanitizeVideoEmbedUrl } from "@/lib/urlSanitizer";
import { useEffect, useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Save, X, Link as LinkIcon, Loader2, Blocks, Copy, ExternalLink, Filter, Search, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { ImdbAutoFill } from "@/components/ImdbAutoFill";
import { TrailerManager } from "@/components/admin/TrailerManager";
import { TrendingSection } from "@/components/TrendingSection";
import { fetchImdbDetails } from "@/lib/imdb";
import { listInstalledAddons, installAddon, uninstallAddon, fetchInstalledAddonCatalogs, fetchExternalMeta } from "@/lib/addons";
import { useAuth } from "@/hooks/useAuth";
import { listCatalog, saveCatalogItem, deleteCatalogItem, type CatalogItemInput, type VideoSource, type CatalogItem } from "@/lib/catalog";

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: (search: Record<string, unknown>): { action?: string | undefined; id?: string | undefined; autofill?: string | undefined } => ({
    action: typeof search["action"] === "string" ? search["action"] : undefined,
    id: typeof search["id"] === "string" ? search["id"] : undefined,
    autofill: typeof search["autofill"] === "string" ? search["autofill"] : undefined,
  }),
  head: () => ({ meta: [{ title: "Admin console — TryBox" }, { name: "description", content: "Add and edit TryBox catalog entries with IMDb auto-import." }] }),
  component: AdminPage,
});

const emptyItem: CatalogItemInput = {
  title: "", year: null, imdb_id: null, rating: "", poster: "", backdrop: "", synopsis: "", type: "movie",
  stars: [], genres: [], sources: [], videos: [], trailers: [], telegram_url: "", vk_url: "",
};

const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none";
const labelCls = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

function AdminPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CatalogItemInput | null>(null);
  const [addonInput, setAddonInput] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<"All" | "movie" | "series" | "anime">("All");
  const [catalogSearch, setCatalogSearch] = useState("");

  const { data: items } = useQuery({ queryKey: ["catalog"], queryFn: listCatalog });
  const { data: addons } = useQuery({ queryKey: ["addons"], queryFn: listInstalledAddons });
  const { data: addonCatalogs, isLoading: loadingAddonCatalogs } = useQuery({ queryKey: ["addonCatalogs"], queryFn: fetchInstalledAddonCatalogs });

  const patch = (next: Partial<CatalogItemInput>) => setDraft((prev) => ({ ...(prev ?? emptyItem), ...next }));

  // OPTIMIZED AUTOFILL: Trailers stripped. Only metadata & episodes fetched.
  const handleTrendingSelect = async (rawIdOrUrl: string) => {
    const toastId = toast.loading("Fetching metadata and episodes...");
    try {
      const match = rawIdOrUrl.match(/(tt\d{7,10})/i);
      const cleanImdbId = match?.[1]?.toLowerCase() || rawIdOrUrl.trim();

      const [meta, extMeta] = await Promise.all([
        fetchImdbDetails(cleanImdbId),
        fetchExternalMeta(cleanImdbId).catch(() => null)
      ]);

      const targetType = (meta.type || extMeta?.type || "movie") as CatalogItem["type"];
      let generatedSources: VideoSource[] = [];
      const fullVideosList = extMeta?.videos?.length ? extMeta.videos : (meta.episodes || []);

      if (targetType === "series" || targetType === "anime") {
        if (fullVideosList && fullVideosList.length > 0) {
          const showTitle = meta.title || extMeta?.title || "Episode";
          generatedSources = fullVideosList.map((ep: any) => {
            const sNum = ep.season !== undefined && ep.season !== null ? Number(ep.season) : 1;
            const epRaw = String(ep.episode ?? "");
            const eNum = Number(epRaw.match(/\d+/)?.[0] ?? 0);
            const epName = ep.name || ep.title || (epRaw.split(" — ")[1] ?? "");
            const code = `S${String(sNum).padStart(2, "0")}E${String(eNum).padStart(2, "0")}`;
            return {
              server: `${showTitle} - ${code}${epName ? ` - ${epName}` : ""}`,
              url: "", type: "Auto", season: sNum, episode: epRaw ? (epRaw.startsWith("Episode") ? epRaw : `Episode ${epRaw}`) : undefined,
            };
          });
        }
      }

      patch({
        title: meta.title || extMeta?.title || "",
        year: meta.year || extMeta?.year || null,
        imdb_id: cleanImdbId,
        rating: meta.rating ? String(meta.rating) : (extMeta?.rating ? String(extMeta.rating) : ""),
        poster: meta.poster || extMeta?.poster || "",
        backdrop: meta.backdrop || extMeta?.backdrop || "",
        synopsis: meta.synopsis || extMeta?.synopsis || "",
        type: targetType,
        stars: meta.stars || [],
        genres: meta.genres?.length ? meta.genres : (extMeta?.genres || []),
        videos: fullVideosList, 
        ...(generatedSources.length ? { sources: generatedSources } : {}),
      });

      toast.success(generatedSources.length ? `Auto-filled details and loaded episodes!` : `Auto-filled successfully!`, { id: toastId });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch details", { id: toastId });
    }
  };

  useEffect(() => {
    if (search.action === "new" && search.autofill) {
      setDraft({ ...emptyItem });
      void handleTrendingSelect(search.autofill);
      void navigate({ to: "/admin", search: {}, replace: true });
    } else if (search.action === "new") {
      setDraft({ ...emptyItem });
      void navigate({ to: "/admin", search: {}, replace: true });
    } else if (search.action === "edit" && search.id && items) {
      const itemToEdit = items.find((item) => item.id === search.id);
      if (itemToEdit) {
        setDraft({ ...itemToEdit });
        void navigate({ to: "/admin", search: {}, replace: true });
      }
    }
  }, [search.action, search.id, search.autofill, items, navigate]);

  const save = useMutation({
    mutationFn: saveCatalogItem,
    onSuccess: () => { toast.success("Saved"); setDraft(null); void queryClient.invalidateQueries({ queryKey: ["catalog"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteCatalogItem,
    onSuccess: () => { toast.success("Deleted"); void queryClient.invalidateQueries({ queryKey: ["catalog"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const installAddonMut = useMutation({
    mutationFn: installAddon,
    onSuccess: () => { toast.success("Addon installed!"); setAddonInput(""); void queryClient.invalidateQueries({ queryKey: ["addons"] }); void queryClient.invalidateQueries({ queryKey: ["addonCatalogs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAddonMut = useMutation({
    mutationFn: uninstallAddon,
    onSuccess: () => { toast.success("Addon removed!"); void queryClient.invalidateQueries({ queryKey: ["addons"] }); void queryClient.invalidateQueries({ queryKey: ["addonCatalogs"] }); },
  });

  const setSource = (idx: number, next: Partial<VideoSource>) => patch({ sources: (draft?.sources ?? []).map((s, i) => (i === idx ? { ...s, ...next } : s)) });
  const removeSourceMirror = (idx: number) => patch({ sources: (draft?.sources ?? []).map((source, i) => { if (i !== idx) return source; const { mirrorDownloadUrl: _removed, ...rest } = source; return rest; }) });
  const copySourceLink = async (value: string) => { if (!value) return; try { await navigator.clipboard.writeText(value); toast.success("Link copied"); } catch { toast.error("Could not copy the link"); } };

  const groupedCatalogs = useMemo(() => {
    if (!addonCatalogs) return {};
    const searchLower = catalogSearch.toLowerCase().trim();
    const filtered = addonCatalogs.filter((c: any) => {
      const matchesType = catalogFilter === "All" || c.type === catalogFilter;
      const matchesSearch = !searchLower || (c.name && c.name.toLowerCase().includes(searchLower)) || (c.year && String(c.year).includes(searchLower)) || (c.releaseInfo && String(c.releaseInfo).includes(searchLower));
      return matchesType && matchesSearch;
    });
    return filtered.reduce((acc, curr) => {
      const groupName = curr.addonName || "Other Addons";
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(curr);
      return acc;
    }, {} as Record<string, typeof addonCatalogs>);
  }, [addonCatalogs, catalogFilter, catalogSearch]);

  if (loading) return <p className="p-10 text-center text-sm text-muted-foreground">Loading…</p>;
  if (!isAdmin) return <div className="min-h-screen bg-background"><SiteHeader /><p className="p-10 text-center text-sm text-muted-foreground">This account doesn't have admin access.</p></div>;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 pt-24">
        <button onClick={() => { if (window.history.length > 1) { window.history.back(); } else { void navigate({ to: "/" }); } }} className="group mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-foreground/90 shadow-md backdrop-blur-md transition hover:border-white/30 hover:bg-white/20 hover:text-foreground">
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to Catalog</span>
        </button>

        <ApkUrlSetting />
        <div className="mb-8 rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4"><Blocks className="size-5 text-primary" /> Stremio Addon Manager</h2>
          <div className="flex gap-2">
            <input value={addonInput} onChange={(e) => setAddonInput(e.target.value)} placeholder="Paste manifest.json URL" className={inputCls} />
            <button onClick={() => installAddonMut.mutate(addonInput)} disabled={!addonInput || installAddonMut.isPending} className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {installAddonMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Install
            </button>
          </div>
          {addons && addons.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {addons.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {a.icon_url ? <img src={a.icon_url} className="size-5 rounded object-cover" alt="" /> : <LinkIcon className="size-4 text-muted-foreground" />}
                    <span className="truncate text-sm font-medium text-foreground" title={a.manifest_url}>{a.name}</span>
                  </div>
                  <button onClick={() => removeAddonMut.mutate(a.id)} className="text-destructive hover:opacity-80 shrink-0 ml-2"><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Catalog Management</h1>
          <button onClick={() => setDraft({ ...emptyItem })} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"><Plus className="size-3.5" /> New item</button>
        </div>

        {!draft && (
          <div className="mt-6 mb-6 space-y-8">
            <div><p className="text-sm text-muted-foreground mb-2">Click a trending title to auto-fill metadata into a new entry.</p><TrendingSection onSelect={handleTrendingSelect} /></div>
            <div>
              <div className="flex flex-col gap-3 pb-4 border-b border-border mb-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">Explore Addon Catalogs <Filter className="size-4" /></h2>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input type="text" placeholder="Search title or year..." value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} className="w-full rounded-full border border-border bg-background/50 py-1.5 pl-9 pr-4 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all" />
                  </div>
                </div>
                <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-1">
                  {["All", "movie", "series", "anime"].map((type) => (
                    <button key={type} onClick={() => setCatalogFilter(type as any)} className={`rounded-full border px-4 py-1.5 text-xs font-semibold capitalize transition ${catalogFilter === type ? "border-primary bg-primary text-primary-foreground shadow-[0_0_12px_rgba(168,85,247,0.4)]" : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`}>{type}</button>
                  ))}
                </div>
              </div>
              {loadingAddonCatalogs ? (
                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{[...Array(6)].map((_, i) => (<div key={i} className="w-32 shrink-0 sm:w-40 h-48 sm:h-60 rounded-2xl bg-muted animate-pulse" />))}</div>
              ) : Object.keys(groupedCatalogs).length > 0 ? (
                <div className="space-y-6">
                  {Object.entries(groupedCatalogs).map(([groupName, items]) => (
                    <div key={groupName} className="space-y-3">
                      <h3 className="text-sm font-medium text-foreground/80 flex items-center gap-2"><Blocks className="size-4 text-primary/70" /> Catalogs from {groupName}</h3>
                      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {items.map((c: any) => (
                          <button key={c.id} onClick={() => handleTrendingSelect(c.id)} className="group w-32 shrink-0 snap-start text-left sm:w-40">
                            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition group-hover:-translate-y-1 group-hover:border-primary/50 group-hover:shadow-md">
                              {c.poster ? (<img src={c.poster} alt={c.name} className="h-48 w-full object-cover sm:h-60" />) : (<div className="h-48 w-full bg-muted/40 sm:h-60 flex items-center justify-center"><span className="text-xs text-muted-foreground">No Image</span></div>)}
                              <div className="space-y-1 p-2 sm:p-3"><p className="truncate text-xs font-semibold text-foreground sm:text-sm">{c.name}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">{c.type}</p></div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (<div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No catalogs found.</div>)}
            </div>
          </div>
        )}

        {draft && (
          <section className="mt-5 mb-8 space-y-4 rounded-2xl border border-border bg-card p-4">
            <ImdbAutoFill onAutofill={(meta) => handleTrendingSelect(meta.imdbId)} />
            
            <TrailerManager trailers={draft.trailers || []} onChange={(trailers) => patch({ trailers })} />

            <div className="grid gap-3 sm:grid-cols-2 mt-4">
              <div><label className={labelCls}>Title</label><input className={inputCls} value={draft.title} onChange={(e) => patch({ title: e.target.value })} /></div>
              <div><label className={labelCls}>IMDb ID (tt...)</label><input className={inputCls} placeholder="e.g. tt1234567" value={draft.imdb_id ?? ""} onChange={(e) => patch({ imdb_id: e.target.value ? e.target.value.trim() : null })} /></div>
              <div><label className={labelCls}>Release year</label><input className={inputCls} value={draft.year ?? ""} onChange={(e) => patch({ year: e.target.value ? Number(e.target.value) : null })} /></div>
              <div><label className={labelCls}>IMDb rating</label><input className={inputCls} value={draft.rating ?? ""} onChange={(e) => patch({ rating: e.target.value })} /></div>
              <div><label className={labelCls}>Content type</label><select className={inputCls} value={draft.type} onChange={(e) => patch({ type: e.target.value as CatalogItem["type"] })}><option value="movie">movie</option><option value="series">series</option><option value="anime">anime</option></select></div>
              <div><label className={labelCls}>Poster URL</label><input className={inputCls} value={draft.poster ?? ""} onChange={(e) => patch({ poster: e.target.value })} /></div>
              <div><label className={labelCls}>Backdrop URL</label><input className={inputCls} value={draft.backdrop ?? ""} onChange={(e) => patch({ backdrop: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={labelCls}>Synopsis</label><textarea rows={3} className={inputCls} value={draft.synopsis ?? ""} onChange={(e) => patch({ synopsis: e.target.value })} /></div>
              <div><label className={labelCls}>Genres (comma separated)</label><input className={inputCls} value={draft.genres.join(", ")} onChange={(e) => patch({ genres: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} /></div>
              <div><label className={labelCls}>Stars / cast (comma separated)</label><input className={inputCls} value={draft.stars.join(", ")} onChange={(e) => patch({ stars: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} /></div>
              <div><label className={labelCls}>Telegram URL</label><input className={inputCls} value={draft.telegram_url ?? ""} onChange={(e) => patch({ telegram_url: e.target.value })} /></div>
              <div><label className={labelCls}>VK URL</label><input className={inputCls} value={draft.vk_url ?? ""} onChange={(e) => patch({ vk_url: sanitizeVideoEmbedUrl(e.target.value) })} /></div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={labelCls}>Video sources / episodes ({draft.sources.length})</span>
                <button onClick={() => patch({ sources: [...draft.sources, { server: `${draft.title ? `${draft.title} - ` : ""}Server ${draft.sources.length + 1}`, url: "", type: "Auto" }] })} className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent">+ Add episode / source</button>
              </div>
              {draft.sources.map((s, idx) => (
                <div key={idx} className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                    <input className={inputCls} placeholder="Server name" value={s.server} onChange={(e) => setSource(idx, { server: e.target.value })} />
                    <input className={inputCls} placeholder="Season number (optional)" value={s.season ?? ""} onChange={(e) => setSource(idx, { season: e.target.value ? Number(e.target.value) : null })} />
                    <input className={inputCls} placeholder="Episode label" value={s.episode ?? ""} onChange={(e) => setSource(idx, { episode: e.target.value })} />
                    <button type="button" onClick={() => patch({ sources: draft.sources.filter((_, i) => i !== idx) })} className="flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-destructive" aria-label="Remove source"><Trash2 className="size-4" /></button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <input className={inputCls} placeholder="Streaming / External URL" value={s.url} onChange={(e) => setSource(idx, { url: sanitizeVideoEmbedUrl(e.target.value) })} />
                    <a href={s.url || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!s.url} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40"><ExternalLink className="size-3.5" /> Test</a>
                    <button type="button" disabled={!s.url} onClick={() => void copySourceLink(s.url)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs text-foreground disabled:opacity-40"><Copy className="size-3.5" /> Copy</button>
                  </div>
                  <input className={inputCls} placeholder="In-app Player URL (optional)" value={s.inAppUrl ?? ""} onChange={(e) => setSource(idx, { inAppUrl: sanitizeVideoEmbedUrl(e.target.value) })} />
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <input className={inputCls} placeholder="VK URL (SnapWC)" value={s.vkDownloadUrl ?? ""} onChange={(e) => setSource(idx, { vkDownloadUrl: sanitizeVideoEmbedUrl(e.target.value) })} />
                    <a href={s.vkDownloadUrl || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!s.vkDownloadUrl} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40"><ExternalLink className="size-3.5" /> Test</a>
                    <button type="button" disabled={!s.vkDownloadUrl} onClick={() => void copySourceLink(s.vkDownloadUrl ?? "")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs text-foreground disabled:opacity-40"><Copy className="size-3.5" /> Copy</button>
                  </div>
                  <input className={inputCls} placeholder="Direct Download URL (optional)" value={s.downloadUrl ?? ""} onChange={(e) => setSource(idx, { downloadUrl: e.target.value })} />
                  {s.mirrorDownloadUrl !== undefined ? (
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input className={inputCls} placeholder="Mirror Download URL" value={s.mirrorDownloadUrl} onChange={(e) => setSource(idx, { mirrorDownloadUrl: e.target.value })} />
                      <button type="button" onClick={() => removeSourceMirror(idx)} className="rounded-lg border border-border px-3 text-xs text-muted-foreground">Remove mirror</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setSource(idx, { mirrorDownloadUrl: "" })} className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">+ Add Mirror Download URL</button>
                  )}
                  <input className={inputCls} placeholder="Other Link URL (optional)" value={s.otherUrl ?? ""} onChange={(e) => setSource(idx, { otherUrl: e.target.value })} />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => save.mutate(draft)} disabled={!draft.title || save.isPending} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"><Save className="size-4" /> Save</button>
              <button onClick={() => setDraft(null)} className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"><X className="size-4" /> Cancel</button>
            </div>
          </section>
        )}

        <section className="mt-8 space-y-2">
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Database Catalog Items ({items?.length ?? 0})</h2>
          </div>
          {(items ?? []).map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-border/80">
              {item.poster ? (<img src={item.poster} alt="" className="h-14 w-10 shrink-0 rounded object-cover shadow-sm" />) : (<div className="h-14 w-10 shrink-0 rounded bg-muted/40" />)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.type} · {item.year ?? "—"} {item.genres?.length ? `· ${item.genres.join(", ")}` : ""}{item.imdb_id ? ` · ${item.imdb_id}` : ""}</p>
              </div>
              <button onClick={() => { setDraft({ ...item }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Edit title"><Pencil className="size-4" /></button>
              <button onClick={() => { if (window.confirm(`Are you sure you want to delete "${item.title}"?`)) { remove.mutate(item.id); } }} className="rounded-lg border border-border p-2 text-destructive hover:bg-destructive/10" aria-label="Delete title"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}


function ApkUrlSetting() {
  const [url, setUrl] = useState("");
  useEffect(() => {
    try { setUrl(localStorage.getItem("kino_apk_url") || ""); } catch {}
  }, []);
  return (
    <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-bold text-foreground">Android APK Direct Download URL</h2>
      <div className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://.../trybox.apk" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
        <button
          type="button"
          onClick={() => { try { localStorage.setItem("kino_apk_url", url.trim()); toast.success("APK link saved"); } catch {} }}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Save APK URL
        </button>
      </div>
    </div>
  );
}
