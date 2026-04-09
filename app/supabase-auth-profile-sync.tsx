"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createBrowserSupabase } from "@/src/lib/supabase";
import { DASHBOARD_PROFILE_QUERY_KEY } from "@/src/hooks/useKpiQueries";

/**
 * Auth 이벤트·탭 포커스 시 `profiles` 쿼리를 무효화하고 refetch해 role 등 DB 값과 UI를 맞춥니다.
 * (JWT/세션만 믿지 않고 DB에서 role을 다시 읽도록 useDashboardProfile이 동작)
 */
export function SupabaseAuthProfileSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createBrowserSupabase();

    const refreshProfile = () => {
      void queryClient.invalidateQueries({
        queryKey: [...DASHBOARD_PROFILE_QUERY_KEY],
      });
      void queryClient.refetchQueries({
        queryKey: [...DASHBOARD_PROFILE_QUERY_KEY],
      });
    };

    refreshProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        refreshProfile();
      }
    });

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.auth
        .refreshSession()
        .catch(() => {
          /* 오프라인 등 — 무시 후에도 refreshProfile 로 DB role 재조회 */
        })
        .finally(() => {
          refreshProfile();
        });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [queryClient]);

  return null;
}
