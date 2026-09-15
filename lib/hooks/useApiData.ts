"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError } from "@/lib/types/api";

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// 素のuseState/useEffectベースの簡易データ取得フック。
// deps が変わるたびに再取得する。キャッシュ・再検証ライブラリは使わない方針。
export function useApiData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList
) {
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await fetcher(controller.signal);
        setState({ data, loading: false, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof ApiRequestError
            ? err.message
            : "データの取得に失敗しました。";
        setState({ data: null, loading: false, error: message });
      }
    }

    run();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, reload };
}
