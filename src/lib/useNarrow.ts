import { useEffect, useRef, useState } from "react";

/**
 * Whether the element is narrower than `width` pixels, kept up to date while it is resized (for
 * example when a side panel is dragged smaller). Starts as not narrow until it is measured.
 */
export function useNarrow<T extends HTMLElement>(width: number) {
  const ref = useRef<T>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = (): void => {
      const w = el.getBoundingClientRect().width;
      // A box that is not laid out yet (width 0) is not narrow.
      setNarrow(w > 0 && w < width);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [width]);
  return { ref, narrow };
}
