import { createBrowserSupabase } from "@/src/lib/supabase";
import type {
  SimEquipmentRow,
  SimModelRow,
  SimProcessRow,
  SimProcessWithEquipments,
} from "@/src/types/capa";

export async function fetchSimModels(): Promise<SimModelRow[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("sim_models")
    .select("*")
    .eq("is_active", true)
    .order("model_code");
  if (error) throw new Error(error.message);
  return (data ?? []) as SimModelRow[];
}

export async function fetchProcessesWithEquipments(
  modelId: string
): Promise<SimProcessWithEquipments[]> {
  const supabase = createBrowserSupabase();
  const { data: processes, error: pe } = await supabase
    .from("sim_processes")
    .select("*")
    .eq("model_id", modelId)
    .eq("is_active", true)
    .order("seq_no");
  if (pe) throw new Error(pe.message);

  const plist = (processes ?? []) as SimProcessRow[];
  if (!plist.length) return [];

  const ids = plist.map((p) => p.id);
  const { data: eqs, error: ee } = await supabase
    .from("sim_equipments")
    .select("*")
    .in("process_id", ids)
    .eq("is_active", true)
    .order("sort_order");
  if (ee) throw new Error(ee.message);

  const byProcess = new Map<string, SimEquipmentRow[]>();
  for (const row of (eqs ?? []) as SimEquipmentRow[]) {
    const list = byProcess.get(row.process_id) ?? [];
    list.push(row);
    byProcess.set(row.process_id, list);
  }

  return plist.map((p) => ({
    ...p,
    equipments: byProcess.get(p.id) ?? [],
  }));
}
