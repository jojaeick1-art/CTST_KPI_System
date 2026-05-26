"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteSmtSetupWeeklyPerformance,
  fetchSmtSetupScheduleBundle,
  upsertSmtSetupOverallAchievement,
  upsertSmtSetupWeeklyPerformance,
  type SmtSetupWeekKey,
} from "@/src/lib/smt-setup-schedule";
import { CURRENT_KPI_YEAR } from "@/src/lib/kpi-queries";

export function useSmtSetupScheduleBundle(
  enabled = true,
  year: number = CURRENT_KPI_YEAR
) {
  return useQuery({
    queryKey: ["smt-setup-schedule", year],
    queryFn: () => fetchSmtSetupScheduleBundle(year),
    enabled,
  });
}

export function useUpsertSmtSetupWeeklyPerformance(year: number = CURRENT_KPI_YEAR) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertSmtSetupWeeklyPerformance,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["smt-setup-schedule", year] });
    },
  });
}

export function useDeleteSmtSetupWeeklyPerformance(year: number = CURRENT_KPI_YEAR) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSmtSetupWeeklyPerformance,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["smt-setup-schedule", year] });
    },
  });
}

export function useUpsertSmtSetupOverallAchievement(year: number = CURRENT_KPI_YEAR) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertSmtSetupOverallAchievement,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["smt-setup-schedule", year] });
    },
  });
}

export type UpsertSmtSetupWeeklyInput = {
  taskId: string;
  year: number;
  weekKey: SmtSetupWeekKey;
  achievementRate: number;
  description: string;
  evidenceUrls?: string[];
  evidenceOriginalFilenames?: string[];
};
