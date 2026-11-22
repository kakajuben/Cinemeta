import { Link } from "@tanstack/react-router";
import { FileEdit, Trash } from "lucide-react";
import type { CatalogItem } from "@/lib/catalog";
import { useAuth } from "@/hooks/useAuth";

export function FilteredGrid({ items }: { items: CatalogItem[] }) {
  const { isAdmin } = useAuth();

  return (
    <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.id} className="group relative">
          <Link to="/title/$id" params={{ id: item.id }} className="block">
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-secondary ring-1 ring-border/60 transition duration-300 group-hover:scale-[1.03] group-hover:ring-primary/60">
              {item.poster ? (
                <img
                  src={item.poster}
                  alt={`${item.title} poster`}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                  {item.title}
                </div>
              )}
              {item.rating && (
                <span className="absolute right-1.5 top-1.5 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 backdrop-blur">
                  ★ {item.rating}
                </span>
              )}
            </div>
            <p className="mt-2 truncate text-sm font-medium text-foreground">{item.title}</p>
            <p className="text-xs capitalize text-muted-foreground">
              {item.type}
              {item.year ? ` · ${item.year}` : ""}
            </p>
          </Link>

          {isAdmin && (
            <div className="absolute left-2 top-2 z-10 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <a href={`/admin?action=edit&id=${item.id}`} className="rounded-md bg-black/70 p-1.5 text-white shadow-md backdrop-blur-md hover:bg-black">
                <FileEdit className="size-3.5" />
              </a>
              <button className="rounded-md bg-red-500/80 p-1.5 text-white shadow-md backdrop-blur-md hover:bg-red-600">
                <Trash className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
