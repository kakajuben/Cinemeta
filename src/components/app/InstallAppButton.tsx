import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X } from "lucide-react";

type BIP = Event & { prompt: () => Promise<void> };

export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BIP | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [guide, setGuide] = useState(false);
  const [apk, setApk] = useState("");

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    try { setApk(localStorage.getItem("kino_apk_url") || ""); } catch {}
    const h = (e: Event) => { e.preventDefault(); setDeferred(e as BIP); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  if (standalone) return null;

  const onClick = async () => {
    if (deferred) { await deferred.prompt(); setDeferred(null); return; }
    setGuide(true);
  };

  return (
    <>
      <button type="button" onClick={onClick} aria-label="Install app" className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-2 text-xs font-semibold text-white/85 backdrop-blur transition hover:bg-white/10">
        <Download className="size-4" /><span className="hidden sm:inline">Install App</span>
      </button>
      {guide && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setGuide(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-950/90 p-5 text-sm text-white shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="font-semibold">Install TryBox Cinema</p><button onClick={() => setGuide(false)} aria-label="Close"><X className="size-4" /></button></div>
            {ios ? (
              <ol className="space-y-3 text-white/80">
                <li className="flex items-center gap-2">1. Tap <Share className="size-4 text-sky-400" /> Share in Safari</li>
                <li className="flex items-center gap-2">2. Choose <PlusSquare className="size-4 text-sky-400" /> “Add to Home Screen”</li>
                <li>3. Tap “Add”</li>
              </ol>
            ) : (
              <p className="text-white/80">Open your browser menu (⋮) and tap “Install app” or “Add to Home screen”.</p>
            )}
            {apk && <a href={apk} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 font-semibold text-black"><Download className="size-4" />Download Android APK</a>}
          </div>
        </div>
      )}
    </>
  );
}
