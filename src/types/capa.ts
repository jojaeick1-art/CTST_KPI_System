/** Supabase `sim_models` */
export type SimModelRow = {
  id: string;
  model_code: string;
  model_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Supabase `sim_processes` */
export type SimProcessRow = {
  id: string;
  model_id: string;
  process_code: string;
  process_name: string;
  seq_no: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Supabase `sim_equipments` */
export type SimEquipmentRow = {
  id: string;
  process_id: string;
  equipment_name: string;
  ct_sec: number;
  std_uptime_rate: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SimProcessWithEquipments = SimProcessRow & {
  equipments: SimEquipmentRow[];
};

export type ShiftPreset = "8h" | "12h";
