import { useEffect, useState } from "react";

interface AmbientGlowProps { poster?: string | null; active: boolean }

export function AmbientGlow({ poster, active }: AmbientGlowProps) {
  const [source, setSource] = useState(poster ?? "");
  useEffect(() => setSource(poster ?? ""), [poster]);
  if (!active) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-visible">
      {source ? (
        <img src={source} alt="" className="absolute inset-[-8%] size-[116%] scale-110 object-cover opacity-45 blur-3xl saturate-150 transition-opacity duration-700" />
      ) : (
        <div className="absolute inset-[-8%] bg-primary/20 blur-3xl" />
      )}
    </div>
  );
}
