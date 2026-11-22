import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";

const HOME_PATH = "/";

export function useSmartBackGuard() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const lastBackAt = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;

    const onPopState = (event: PopStateEvent) => {
      const modalOpen = document.querySelector('[role="dialog"], [aria-modal="true"]') !== null;
      if (modalOpen) {
        event.preventDefault?.();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        return;
      }

      if (isStandalone && pathname === HOME_PATH) {
        const now = Date.now();
        if (now - lastBackAt.current < 2000) {
          window.history.back();
          return;
        }
        lastBackAt.current = now;
        toast("Press back again to exit", { duration: 2000, position: "top-center" });
        window.history.pushState(null, "", window.location.href);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [pathname]);
}
