"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchProcessesWithEquipments,
  fetchSimModels,
} from "@/src/lib/capa-queries";

export const CAPA_MODELS_QUERY_KEY = ["supabase", "capa", "models"] as const;

export function useCapaModels(enabled = true) {
  return useQuery({
    queryKey: CAPA_MODELS_QUERY_KEY,
    queryFn: fetchSimModels,
    enabled,
  });
}

export function useCapaRecipe(modelId: string | undefined) {
  return useQuery({
    queryKey: ["supabase", "capa", "recipe", modelId ?? ""],
    queryFn: () => fetchProcessesWithEquipments(modelId!),
    enabled: Boolean(modelId),
  });
}
