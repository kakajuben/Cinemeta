import { useEffect, useState } from "react";

export function SplashScreen() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let splashed = false;
    try { splashed = sessionStorage.getItem("kino_splashed") === "1"; } catch {}
    if (!splashed) {
      setVisible(true);
      try { sessionStorage.setItem("kino_splashed", "1"); } catch {}
      const timer = window.setTimeout(() => setVisible(false), 900);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, []);

  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-[#100d14] transition-opacity duration-300" role="status" aria-label="Loading TryBox Cinema">
      <div className="flex flex-col items-center gap-5">
        <div className="relative grid size-24 place-items-center rounded-full border border-primary/40 bg-primary/10 shadow-[0_0_60px_hsl(var(--primary)/0.45)]">
          <div className="absolute inset-3 animate-pulse rounded-full border-4 border-dashed border-primary/70" />
          <span className="relative font-display text-4xl font-black text-primary">T</span>
        </div>
        <div className="text-center">
          <p className="font-display text-xl font-black tracking-[0.25em] text-white">TRYBOX</p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.35em] text-white/50">Cinema</p>
        </div>
        <div className="h-1 w-36 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/2 animate-pulse rounded-full bg-primary" /></div>
      </div>
    </div>
  );
}
