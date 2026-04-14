'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Tracks which items are "new" (recently added).
 * Items are marked as new for `durationMs` then automatically unmarked.
 */
export function useNewItems(durationMs: number = 10000) {
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const markNew = useCallback((id: string) => {
    setNewIds((prev) => new Set(prev).add(id));

    // Clear any existing timer for this id
    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);

    // Auto-remove after duration
    const timer = setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      timersRef.current.delete(id);
    }, durationMs);

    timersRef.current.set(id, timer);
  }, [durationMs]);

  const markManyNew = useCallback((ids: string[]) => {
    ids.forEach(markNew);
  }, [markNew]);

  const isNew = useCallback((id: string) => newIds.has(id), [newIds]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return { isNew, markNew, markManyNew, newIds };
}
