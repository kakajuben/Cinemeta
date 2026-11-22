import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Film, Tv, Sparkles, Bookmark } from "lucide-react";

const items = [
  { label: "Home", icon: Home, to: "/", type: undefined },
  { label: "Movies", icon: Film, to: "/", type: "movie" },
  { label: "Series", icon: Tv, to: "/", type: "series" },
  { label: "Anime", icon: Sparkles, to: "/", type: "anime" },
  { label: "My Box", icon: Bookmark, to: "/my-box", type: undefined },
] as const;

export function MobileBottomNav() {
  const loc = useRouterState({ select: (s) => s.location });
  if (loc.pathname.startsWith("/admin") || loc.pathname.startsWith("/title")) return null;
  const curType = (loc.search as { type?: string }).type;
  return (
    <>
      <div className="h-16 md:hidden" aria-hidden />
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/70 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <ul className="grid grid-cols-5">
          {items.map(({ label, icon: Icon, to, type }) => {
            const active = loc.pathname === to && (to !== "/" || curType === type);
            return (
              <li key={label}>
                <Link to={to} search={(type ? { type } : {}) as never} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active ? "text-white" : "text-white/50"}`}>
                  <Icon className={`size-5 ${active ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" : ""}`} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
