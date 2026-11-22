import { useState } from "react";
import { Film, Plus, Trash2, Loader2, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import { type CatalogTrailer, extractViId, extractYouTubeId, buildYouTubeTrailer, fetchVideoMetadata, buildIMDbEmbedUrl } from "@/lib/imdbTrailer";
import { toast } from "sonner";

interface Props {
  trailers: CatalogTrailer[];
  onChange: (trailers: CatalogTrailer[]) => void;
}

export function TrailerManager({ trailers, onChange }: Props) {
  const [inputUrl, setInputUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    const ytId = extractYouTubeId(inputUrl);
    if (ytId) {
      if (trailers.some((t) => t.id === ytId)) { toast.error("This trailer is already in the list."); return; }
      onChange([...trailers, buildYouTubeTrailer(ytId)]);
      toast.success("YouTube trailer added!");
      setInputUrl("");
      return;
    }
    const videoId = extractViId(inputUrl);
    if (!videoId) {
      toast.error("Paste an IMDb video link (vi...) or a YouTube link.");
      return;
    }

    if (trailers.some((t) => t.id === videoId)) {
      toast.error("This trailer is already in the list.");
      return;
    }

    setLoading(true);
    const meta = await fetchVideoMetadata(videoId);
    setLoading(false);

    if (meta && meta.id && meta.embedUrl) {
      onChange([...trailers, meta as CatalogTrailer]);
      toast.success("Trailer added with metadata!");
      setInputUrl("");
    } else {
      const manualTrailer: CatalogTrailer = {
        id: videoId,
        originalUrl: inputUrl,
        embedUrl: buildIMDbEmbedUrl(videoId),
        title: `Trailer: ${videoId}`,
        thumbnail: ""
      };
      onChange([...trailers, manualTrailer]);
      toast.success("Trailer added manually. You can edit the title and thumbnail.");
      setInputUrl("");
    }
  };

  const handleRemove = (id: string) => {
    onChange(trailers.filter((t) => t.id !== id));
  };

  const handleUpdateTitle = (id: string, newTitle: string) => {
    onChange(trailers.map((t) => t.id === id ? { ...t, title: newTitle } : t));
  };

  const handleUpdateThumbnail = (id: string, newThumbnail: string) => {
    onChange(trailers.map((t) => t.id === id ? { ...t, thumbnail: newThumbnail } : t));
  };

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-sm mt-4">
      <div className="flex items-center gap-2 mb-4">
        <Film className="size-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-amber-500">Unlimited IMDb Trailer Gallery</h3>
      </div>
      
      <div className="flex flex-col gap-3 sm:flex-row mb-4">
        <input
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="Paste IMDb video link or YouTube link"
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-amber-500 focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={loading || !inputUrl}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50 transition"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add Video
        </button>
      </div>

      {trailers.length > 0 && (
        <div className="space-y-3">
          {trailers.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/40 p-3 pr-3 transition-colors focus-within:border-amber-500/50">
              <div className="shrink-0 pt-1">
                {t.thumbnail ? (
                  <img src={t.thumbnail} alt="" className="h-14 w-24 rounded object-cover shadow-sm ring-1 ring-white/10" />
                ) : (
                  <div className="flex h-14 w-24 items-center justify-center rounded bg-white/5 ring-1 ring-white/10"><Film className="size-5 text-white/30" /></div>
                )}
              </div>
              
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <input 
                  value={t.title} 
                  onChange={(e) => handleUpdateTitle(t.id, e.target.value)}
                  placeholder="Trailer Title"
                  className="w-full bg-transparent text-sm font-medium text-white focus:outline-none focus:border-b border-amber-500/50 truncate pb-0.5"
                />
                <div className="flex items-center gap-2">
                  <ImageIcon className="size-3.5 text-muted-foreground shrink-0" />
                  <input 
                    value={t.thumbnail} 
                    onChange={(e) => handleUpdateThumbnail(t.id, e.target.value)}
                    placeholder="Paste thumbnail image URL..."
                    className="w-full bg-transparent text-xs text-white/60 focus:outline-none focus:border-b border-amber-500/50 truncate pb-0.5"
                  />
                </div>
                <a href={t.originalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-500/70 hover:text-amber-400 mt-1">
                  <LinkIcon className="size-3" /> {t.id}
                </a>
              </div>

              <button onClick={() => handleRemove(t.id)} className="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-400/10 transition mt-1 shrink-0">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
