export type CapaTransferKind = "recipe_save" | "recipe_load";

export type CapaRecipeTransferStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "error";

export type CapaRecipeTransferRow = {
  id: string;
  kind: CapaTransferKind;
  storage_path: string | null;
  status: CapaRecipeTransferStatus;
  signed_url: string | null;
  error_message: string | null;
  created_at: string;
};
