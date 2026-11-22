import { ExternalLink, Globe } from "lucide-react";

function stripScheme(url: string) {
  return url.replace(/^https?:\/\//i, "");
}

export function DownloadHub({ streamUrl }: { streamUrl?: string | undefined }) {
  if (!streamUrl) return null;
  const scheme = streamUrl.startsWith("http://") ? "http" : "https";
  const oneDm = `intent://${stripScheme(streamUrl)}#Intent;scheme=${scheme};action=android.intent.action.VIEW;type=video/*;package=idm.internet.download.manager;end`;

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs font-semibold text-foreground backdrop-blur transition hover:border-primary hover:bg-primary/10";

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card/40 p-3 backdrop-blur-md">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Open in 1DM / Browser</p>
      <div className="flex flex-wrap gap-2">
        <a href={oneDm} className={btn}><ExternalLink className="size-3.5" />Open in 1DM</a>
        <a href={streamUrl} target="_blank" rel="noopener noreferrer" className={btn}><Globe className="size-3.5" />Open in Browser</a>
      </div>
    </div>
  );
}
