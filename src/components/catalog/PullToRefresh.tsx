import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps { onRefresh: () => Promise<unknown> | unknown; children: ReactNode }

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const startY = useRef<number | null>(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const touchStart = (event: TouchEvent) => {
      if (window.scrollY <= 0) startY.current = event.touches[0]?.clientY ?? null;
    };
    const touchMove = (event: TouchEvent) => {
      if (startY.current === null || window.scrollY > 0) return;
      const currentY = event.touches[0]?.clientY ?? startY.current;
      const pull = Math.max(0, Math.min(96, (currentY - startY.current) * 0.48));
      if (pull > 0) setDistance(pull);
    };
    const touchEnd = async () => {
      if (startY.current === null) return;
      startY.current = null;
      if (distance >= 68) {
        setRefreshing(true);
        await onRefresh();
        setRefreshing(false);
        if (navigator.vibrate) navigator.vibrate(20);
      }
      setDistance(0);
    };
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: true });
    window.addEventListener("touchend", touchEnd);
    return () => {
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
    };
  }, [distance, onRefresh]);

  return <>
    {(distance > 0 || refreshing) && (
      <div className="pointer-events-none fixed left-1/2 top-16 z-[70] -translate-x-1/2 rounded-full border border-white/15 bg-black/60 p-3 text-primary shadow-2xl backdrop-blur-xl" style={{ transform: `translate(-50%, ${Math.min(distance, 48)}px)` }}>
        <RefreshCw className={`size-5 ${refreshing ? "animate-spin" : ""}`} style={{ transform: `rotate(${distance * 3}deg)` }} />
      </div>
    )}
    {children}
  </>;
}
