import { useEffect, useState, type RefObject } from "react";

/** Tracks element content width via ResizeObserver (0 until first measure). */
export function useElementWidth<T extends HTMLElement>(ref: RefObject<T | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = (entry?: ResizeObserverEntry) => {
      const next =
        entry?.contentBoxSize?.[0]?.inlineSize ??
        entry?.contentRect.width ??
        el.getBoundingClientRect().width;
      setWidth(next);
    };

    const observer = new ResizeObserver(([entry]) => measure(entry));
    observer.observe(el);
    measure();

    return () => observer.disconnect();
  }, [ref]);

  return width;
}
