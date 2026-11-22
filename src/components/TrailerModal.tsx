import { useEffect, useState } from "react";
import { X, Film, PlayCircle, ExternalLink } from "lucide-react";
import type { CatalogTrailer } from "@/lib/imdbTrailer";

interface Props {
  trailers: CatalogTrailer[];
  isOpen: boolean;
  onClose: () => void;
  catalogTitle?: string;
}

export function TrailerModal({ trailers, isOpen, onClose, catalogTitle }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && trailers.length > 0) setActiveId(trailers[0]?.id ?? null);
    
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'auto';
    
    return () => { document.body.style.overflow = 'auto'; };
  }, [isOpen, trailers]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || trailers.length === 0) return null;

  const activeTrailer = trailers.find((t) => t.id === activeId) ?? trailers[0];
  if (!activeTrailer) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="absolute inset-0 cursor-pointer" onClick={onClose} />
      
      <div className="relative flex w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl ring-1 ring-white/5 md:flex-row">
        
        <div className="flex-1 bg-black flex flex-col">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-amber-400">
                <Film className="size-3.5" /> Trailer Gallery
              </span>
              <h3 className="text-sm font-semibold text-white/90 hidden sm:block">{catalogTitle || activeTrailer.title}</h3>
            </div>
            <div className="flex items-center gap-3">
              <a href={activeTrailer.originalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition hidden sm:inline-flex">
                <ExternalLink className="size-3.5" /> Open Link
              </a>
              <button onClick={onClose} className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white">
                <X className="size-5" />
              </button>
            </div>
          </div>
          
          <div className="aspect-video w-full bg-black relative">
            <iframe
              key={activeTrailer.id}
              src={activeTrailer.embedUrl}
              title={activeTrailer.title}
              className="absolute inset-0 size-full border-0"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
            />
          </div>
        </div>

        {trailers.length > 1 && (
          <div className="flex w-full shrink-0 flex-row gap-3 overflow-x-auto border-t border-white/10 bg-zinc-950 p-4 md:w-80 md:flex-col md:overflow-y-auto md:border-l md:border-t-0 custom-scrollbar max-h-[30vh] md:max-h-[80vh]">
            <h4 className="hidden text-xs font-bold uppercase tracking-wider text-white/50 md:block pb-2">More Videos</h4>
            {trailers.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`group relative flex w-48 shrink-0 flex-col gap-2 rounded-xl border p-2 text-left transition md:w-full md:flex-row md:items-center ${
                  activeId === t.id
                    ? "border-amber-500/50 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-black md:w-28">
                  {t.thumbnail ? (
                    <img src={t.thumbnail} alt={t.title} className="absolute inset-0 h-full w-full object-cover opacity-80 transition group-hover:scale-105 group-hover:opacity-100" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/5"><Film className="size-5 text-white/30" /></div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 backdrop-blur-[1px] transition group-hover:opacity-100">
                    <PlayCircle className="size-6 text-white" />
                  </div>
                  {activeId === t.id && <div className="absolute inset-0 border-2 border-amber-500 rounded-lg" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`line-clamp-2 text-xs font-semibold ${activeId === t.id ? "text-amber-400" : "text-white/80 group-hover:text-white"}`}>{t.title}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
