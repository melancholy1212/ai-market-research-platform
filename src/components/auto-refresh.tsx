"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the current server page on an interval while `active`, so a
// running research shows progress without a manual reload.
export function AutoRefresh({ active, intervalMs = 2500 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, router]);
  return null;
}
