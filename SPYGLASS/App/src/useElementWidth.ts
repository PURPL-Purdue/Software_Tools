import { useEffect, useRef, useState } from 'react';

// tracks element's render width to properly adjust it according to any changes
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
