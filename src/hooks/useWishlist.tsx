import { useCallback, useEffect, useState } from "react";

const keyFor = (slug: string) => `Storeblink:wishlist:${slug}`;

export const useWishlist = (slug: string | undefined) => {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!slug) return;
    try {
      const raw = localStorage.getItem(keyFor(slug));
      if (raw) setIds(JSON.parse(raw));
    } catch {}
  }, [slug]);

  const persist = useCallback((next: string[]) => {
    setIds(next);
    if (slug) localStorage.setItem(keyFor(slug), JSON.stringify(next));
  }, [slug]);

  const toggle = useCallback((id: string) => {
    setIds((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (slug) localStorage.setItem(keyFor(slug), JSON.stringify(next));
      return next;
    });
  }, [slug]);

  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const clear = useCallback(() => persist([]), [persist]);

  return { ids, has, toggle, clear, count: ids.length };
};
