"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createConstructionProject,
  createConstructionTask,
  deleteConstructionProject,
  deleteConstructionTask,
  fetchConstructionBundle,
  removeConstructionTaskEvidence,
  updateConstructionProject,
  updateConstructionTask,
  uploadConstructionTaskEvidence,
  upsertConstructionWeekly,
  type ConstructionDomain,
} from "@/src/lib/construction-projects";
import { CURRENT_KPI_YEAR } from "@/src/lib/kpi-queries";

function constructionQueryKey(domain: ConstructionDomain, year: number) {
  return ["construction-projects", domain.category, year] as const;
}

export function useConstructionBundle(
  domain: ConstructionDomain,
  enabled = true,
  year: number = CURRENT_KPI_YEAR
) {
  return useQuery({
    queryKey: constructionQueryKey(domain, year),
    queryFn: () => fetchConstructionBundle(domain, year),
    enabled,
  });
}

function useConstructionMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
  domain: ConstructionDomain,
  year: number
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: constructionQueryKey(domain, year),
      });
      await queryClient.invalidateQueries({
        queryKey: [
          domain.category === "setup" ? "smt-setup-schedule" : "campus2-schedule",
          year,
        ],
      });
    },
  });
}

export function useCreateConstructionProject(
  domain: ConstructionDomain,
  year: number = CURRENT_KPI_YEAR
) {
  return useConstructionMutation(createConstructionProject, domain, year);
}

export function useUpdateConstructionProject(
  domain: ConstructionDomain,
  year: number = CURRENT_KPI_YEAR
) {
  return useConstructionMutation(updateConstructionProject, domain, year);
}

export function useDeleteConstructionProject(
  domain: ConstructionDomain,
  year: number = CURRENT_KPI_YEAR
) {
  return useConstructionMutation(deleteConstructionProject, domain, year);
}

export function useCreateConstructionTask(
  domain: ConstructionDomain,
  year: number = CURRENT_KPI_YEAR
) {
  return useConstructionMutation(createConstructionTask, domain, year);
}

export function useUpdateConstructionTask(
  domain: ConstructionDomain,
  year: number = CURRENT_KPI_YEAR
) {
  return useConstructionMutation(updateConstructionTask, domain, year);
}

export function useDeleteConstructionTask(
  domain: ConstructionDomain,
  year: number = CURRENT_KPI_YEAR
) {
  return useConstructionMutation(deleteConstructionTask, domain, year);
}

export function useUploadConstructionTaskEvidence(
  domain: ConstructionDomain,
  year: number = CURRENT_KPI_YEAR
) {
  return useConstructionMutation(uploadConstructionTaskEvidence, domain, year);
}

export function useRemoveConstructionTaskEvidence(
  domain: ConstructionDomain,
  year: number = CURRENT_KPI_YEAR
) {
  return useConstructionMutation(removeConstructionTaskEvidence, domain, year);
}

export function useUpsertConstructionWeekly(
  domain: ConstructionDomain,
  year: number = CURRENT_KPI_YEAR
) {
  return useConstructionMutation(upsertConstructionWeekly, domain, year);
}
