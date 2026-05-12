"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCampus2ScheduleBundle,
  upsertCampus2OverallAchievement,
  upsertCampus2WeeklyPerformance,
  type Campus2WeekKey,
} from "@/src/lib/campus2-schedule";
import { CURRENT_KPI_YEAR } from "@/src/lib/kpi-queries";

export function useCampus2ScheduleBundle(enabled = true, year: number = CURRENT_KPI_YEAR) {
  return useQuery({
    queryKey: ["campus2-schedule", year],
    queryFn: () => fetchCampus2ScheduleBundle(year),
    enabled,
  });
}

export function useUpsertCampus2WeeklyPerformance(year: number = CURRENT_KPI_YEAR) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertCampus2WeeklyPerformance,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campus2-schedule", year] });
    },
  });
}

export function useUpsertCampus2OverallAchievement(year: number = CURRENT_KPI_YEAR) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertCampus2OverallAchievement,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campus2-schedule", year] });
    },
  });
}

export type UpsertCampus2WeeklyInput = {
  taskId: string;
  year: number;
  weekKey: Campus2WeekKey;
  achievementRate: number;
  description: string;
  evidenceUrls?: string[];
  evidenceOriginalFilenames?: string[];
};
