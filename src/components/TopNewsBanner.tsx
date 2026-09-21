import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getTopNews, type TopNewsHeadline } from "@/lib/topNews.functions";
import {
  readCachedTopNews,
  readOfflineCachedTopNews,
  writeCachedTopNews,
} from "@/lib/topNewsBannerCache";

const CLIENT_CACHE_MS = 8 * 60 * 1000; // keep in sync with server CACHE_MS

function formatRelativeTime(publishedAt: string): string | null {
  const ms = Date.parse(publishedAt);
  if (!Number.isFinite(ms)) return null;
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return `${Math.max(1, diffSec)}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

function TickerItem({ h }: { h: TopNewsHeadline }) {
  const relativeTime = h.publishedAt ? formatRelativeTime(h.publishedAt) : null;

  return (
    <a
      href={h.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-5"
      title={h.title}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-400 group-hover:text-amber-300">
        {h.sourceLabel}
      </span>
      {relativeTime ? (
        <>
          <span className="text-[10px] font-mono tabular-nums text-slate-500 group-hover:text-slate-400">
            {relativeTime}
          </span>
          <span className="text-slate-600" aria-hidden>
            ·
          </span>
        </>
      ) : null}
      <span className="text-[12px] font-medium leading-none text-white group-hover:text-slate-100">
        {h.title}
      </span>
      <span className="text-slate-500" aria-hidden>
        •
      </span>
    </a>
  );
}

export function TopNewsBanner() {
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, () => true);
  const initialCache = useMemo(() => readCachedTopNews({ freshOnly: true }), []);
  const fetchTopNews = useServerFn(getTopNews);
  const [lastGoodHeadlines, setLastGoodHeadlines] = useState<TopNewsHeadline[]>(
    () => initialCache?.headlines ?? [],
  );

  const { data, isLoading, isError, isFetched } = useQuery({
    queryKey: ["top-news"],
    queryFn: () => fetchTopNews(),
    staleTime: CLIENT_CACHE_MS,
    refetchInterval: isOnline ? CLIENT_CACHE_MS : false,
    refetchOnReconnect: true,
    retry: isOnline ? 2 : 0,
    placeholderData: keepPreviousData,
    initialData: initialCache
      ? { headlines: initialCache.headlines, errors: {}, fetchedAt: initialCache.fetchedAt }
      : undefined,
  });

  useEffect(() => {
    if (data?.headlines?.length) {
      setLastGoodHeadlines(data.headlines);
      writeCachedTopNews(data.headlines, data.fetchedAt);
    }
  }, [data]);

  const offlineCache = useMemo(() => readOfflineCachedTopNews(), []);
  const headlines = data?.headlines?.length
    ? data.headlines
    : isOnline
      ? lastGoodHeadlines
      : (offlineCache?.headlines ?? lastGoodHeadlines);
  const loop = headlines.length > 0 ? [...headlines, ...headlines] : [];

  const hasLiveData = isOnline && !isError && (data?.headlines?.length ?? 0) > 0;
  const showDisconnected = !isOnline || (isError && isFetched);
  const dotIsGrey = showDisconnected;
  const showLoading = isLoading && headlines.length === 0 && isOnline;
  const showEmptyMessage = headlines.length === 0 && !showLoading;

  return (
    <div
      className="border-b border-slate-800 bg-[#0a1528] shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
      role="region"
      aria-label={showDisconnected && headlines.length > 0 ? "Market headlines (offline cache)" : "Market headlines"}
    >
      <div className="flex h-9 items-stretch">
        <div className="flex shrink-0 items-center gap-2 border-r border-slate-800 bg-[#0d1a32] px-3 sm:px-4">
          <span
            className={[
              "h-1.5 w-1.5 shrink-0 rounded-full",
              dotIsGrey ? "bg-slate-500" : "animate-pulse bg-red-500",
            ].join(" ")}
            aria-hidden
            title={dotIsGrey ? "Offline or feed unavailable — showing last headlines" : "Live headlines"}
          />
          <span className="text-[9px] font-mono font-bold uppercase tracking-[0.16em] text-white sm:text-[10px] sm:tracking-[0.18em]">
            Market Headlines
          </span>
        </div>

        <div className="news-ticker-viewport relative min-w-0 flex-1">
          {showLoading ? (
            <div className="flex h-full items-center px-4">
              <span className="text-[12px] font-medium text-slate-300">Loading headlines…</span>
            </div>
          ) : showEmptyMessage ? (
            <div className="flex h-full items-center px-4">
              <span className="text-[12px] font-medium text-slate-400">
                {!isOnline
                  ? "Offline — headlines will resume when connection returns"
                  : isError
                    ? "Headlines unavailable — feed fetch failed"
                    : "No market headlines right now"}
              </span>
            </div>
          ) : (
            <div className="flex h-full items-center py-0.5">
              <div className={hasLiveData ? "news-ticker-track" : "news-ticker-track opacity-90"}>
                {loop.map((h, i) => (
                  <TickerItem key={`${h.sourceLabel}-${h.url}-${i}`} h={h} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
