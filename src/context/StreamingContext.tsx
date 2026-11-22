import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface TorrentMedia {
  magnetUri: string;
  title: string;
  poster?: string;
}

interface StreamingContextType {
  serverUrl: string;
  setServerUrl: (url: string) => void;
  isServerOnline: boolean;
  isChecking: boolean;
  activeTorrent: TorrentMedia | null;
  startStreaming: (media: TorrentMedia) => void;
  stopStreaming: () => void;
  checkHealth: () => Promise<void>;
}

const DEFAULT_SERVER_URL = "http://localhost:3000";
const STORAGE_KEY = "trybox_streaming_engine_url";

const StreamingContext = createContext<StreamingContextType | undefined>(undefined);

export function StreamingProvider({ children }: { children: ReactNode }) {
  const [serverUrl, setServerUrlState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_SERVER_URL;
    }
    return DEFAULT_SERVER_URL;
  });

  const [isServerOnline, setIsServerOnline] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [activeTorrent, setActiveTorrent] = useState<TorrentMedia | null>(null);

  const setServerUrl = (url: string) => {
    const cleaned = url.replace(/\/+$/, "");
    setServerUrlState(cleaned);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, cleaned);
    }
  };

  const checkHealth = async () => {
    setIsChecking(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${serverUrl}/health`, {
        method: "GET",
        signal: controller.signal,
        mode: "cors",
      });
      clearTimeout(timeoutId);
      setIsServerOnline(res.ok);
    } catch {
      setIsServerOnline(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [serverUrl]);

  return (
    <StreamingContext.Provider
      value={{
        serverUrl,
        setServerUrl,
        isServerOnline,
        isChecking,
        activeTorrent,
        startStreaming: (media) => setActiveTorrent(media),
        stopStreaming: () => setActiveTorrent(null),
        checkHealth,
      }}
    >
      {children}
    </StreamingContext.Provider>
  );
}

export function useStreaming() {
  const context = useContext(StreamingContext);
  if (!context) {
    throw new Error("useStreaming must be used within a StreamingProvider");
  }
  return context;
}
