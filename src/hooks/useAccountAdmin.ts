"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAccount,
  deleteAccount,
  fetchAccountAdminBundle,
  resetAccountPassword,
  updateAccountAssignment,
} from "@/src/lib/account-admin";
import { DASHBOARD_PROFILE_QUERY_KEY } from "@/src/hooks/useKpiQueries";

const ACCOUNT_ADMIN_QUERY_KEY = ["supabase", "account-admin"] as const;

export function useAccountAdminBundle(enabled: boolean) {
  return useQuery({
    queryKey: ACCOUNT_ADMIN_QUERY_KEY,
    queryFn: fetchAccountAdminBundle,
    enabled,
  });
}

function useAccountMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ACCOUNT_ADMIN_QUERY_KEY });
      // 본인 계정을 수정한 경우 사이드바·권한 표시가 곧바로 반영되도록 갱신
      await queryClient.invalidateQueries({ queryKey: DASHBOARD_PROFILE_QUERY_KEY });
    },
  });
}

export function useUpdateAccountAssignment() {
  return useAccountMutation(updateAccountAssignment);
}

export function useCreateAccount() {
  return useAccountMutation(createAccount);
}

export function useDeleteAccount() {
  return useAccountMutation(deleteAccount);
}

export function useResetAccountPassword() {
  return useAccountMutation(resetAccountPassword);
}
