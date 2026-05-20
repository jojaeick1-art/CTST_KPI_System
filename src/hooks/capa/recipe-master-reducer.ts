import type { CapaProcess, CapaRecipe } from "@/src/types/capa-recipe";

export type RecipeMasterState = {
  baseline: CapaRecipe | null;
  draft: CapaRecipe | null;
  isDirty: boolean;
  selectedProcessId: string | null;
  transferStatus: "idle" | "saving" | "loading" | "error";
  transferMessage?: string;
};

export const initialRecipeMasterState: RecipeMasterState = {
  baseline: null,
  draft: null,
  isDirty: false,
  selectedProcessId: null,
  transferStatus: "idle",
};

export type RecipeMasterAction =
  | { type: "LOAD_RECIPE"; recipe: CapaRecipe }
  | { type: "RESET_DRAFT" }
  | { type: "SELECT_PROCESS"; processId: string | null }
  | { type: "REORDER_PROCESSES"; processIds: string[] }
  | { type: "UPDATE_PROCESS"; processId: string; patch: Partial<CapaProcess> }
  | { type: "ADD_PROCESS"; process: CapaProcess }
  | { type: "REMOVE_PROCESS"; processId: string }
  | { type: "UPDATE_META"; patch: Partial<CapaRecipe["meta"]> }
  | { type: "TRANSFER_START"; mode: "saving" | "loading" }
  | { type: "TRANSFER_DONE" }
  | { type: "TRANSFER_ERROR"; message: string };

function cloneRecipe(recipe: CapaRecipe): CapaRecipe {
  return JSON.parse(JSON.stringify(recipe)) as CapaRecipe;
}

function touchMeta(draft: CapaRecipe): CapaRecipe {
  return {
    ...draft,
    meta: { ...draft.meta, updatedAt: new Date().toISOString() },
  };
}

export function recipeMasterReducer(
  state: RecipeMasterState,
  action: RecipeMasterAction
): RecipeMasterState {
  switch (action.type) {
    case "LOAD_RECIPE": {
      const recipe = cloneRecipe(action.recipe);
      return {
        ...state,
        baseline: recipe,
        draft: cloneRecipe(recipe),
        isDirty: false,
        selectedProcessId: recipe.processes[0]?.id ?? null,
        transferStatus: "idle",
        transferMessage: undefined,
      };
    }
    case "RESET_DRAFT":
      if (!state.baseline) return state;
      return {
        ...state,
        draft: cloneRecipe(state.baseline),
        isDirty: false,
      };
    case "SELECT_PROCESS":
      return { ...state, selectedProcessId: action.processId };
    case "REORDER_PROCESSES": {
      if (!state.draft) return state;
      const map = new Map(state.draft.processes.map((p) => [p.id, p]));
      const processes = action.processIds
        .map((id, i) => {
          const p = map.get(id);
          return p ? { ...p, seqNo: i + 1 } : null;
        })
        .filter((p): p is CapaProcess => p != null);
      return {
        ...state,
        draft: touchMeta({ ...state.draft, processes }),
        isDirty: true,
      };
    }
    case "UPDATE_META": {
      if (!state.draft) return state;
      return {
        ...state,
        draft: touchMeta({
          ...state.draft,
          meta: { ...state.draft.meta, ...action.patch },
        }),
        isDirty: true,
      };
    }
    case "UPDATE_PROCESS": {
      if (!state.draft) return state;
      const processes = state.draft.processes.map((p) =>
        p.id === action.processId ? { ...p, ...action.patch } : p
      );
      return { ...state, draft: touchMeta({ ...state.draft, processes }), isDirty: true };
    }
    case "ADD_PROCESS": {
      if (!state.draft) return state;
      return {
        ...state,
        draft: touchMeta({
          ...state.draft,
          processes: [...state.draft.processes, action.process],
        }),
        isDirty: true,
        selectedProcessId: action.process.id,
      };
    }
    case "REMOVE_PROCESS": {
      if (!state.draft) return state;
      const processes = state.draft.processes.filter((p) => p.id !== action.processId);
      return {
        ...state,
        draft: touchMeta({ ...state.draft, processes }),
        isDirty: true,
        selectedProcessId: processes[0]?.id ?? null,
      };
    }
    case "TRANSFER_START":
      return {
        ...state,
        transferStatus: action.mode,
        transferMessage: undefined,
      };
    case "TRANSFER_DONE":
      return {
        ...state,
        baseline: state.draft ? cloneRecipe(state.draft) : state.baseline,
        isDirty: false,
        transferStatus: "idle",
        transferMessage: undefined,
      };
    case "TRANSFER_ERROR":
      return {
        ...state,
        transferStatus: "error",
        transferMessage: action.message,
      };
    default:
      return state;
  }
}
