import { useCallback, useEffect, useState } from "react";
import { fetchApiHealth, type ApiHealth } from "./api";

export type ApiStatus = "checking" | "online" | "offline";

export const API_URL =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

export interface UseApiHealthResult {
  status: ApiStatus;
  health: ApiHealth | null;
  lastChecked: Date | null;
  recheck: () => void;
}

export function useApiHealth(intervalMs = 30000): UseApiHealthResult {
  const [status, setStatus] = useState<ApiStatus>("checking");
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  const recheck = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setStatus("checking");
      const h = await fetchApiHealth();
      if (cancelled) return;
      setHealth(h);
      setStatus(h?.ok ? "online" : "offline");
      setLastChecked(new Date());
    };
    void check();
    const id = window.setInterval(() => void check(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs, tick]);

  return { status, health, lastChecked, recheck };
}
