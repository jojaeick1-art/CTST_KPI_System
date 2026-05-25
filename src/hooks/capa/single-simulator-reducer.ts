import { normalizeArrayMultiplier } from "@/src/lib/capa/recipe-normalize";
import { simulationCalendar, todayYmd } from "@/src/lib/capa/shift-calendar";
import type { CapaRecipe } from "@/src/types/capa-recipe";
import type { RecipeOverrideMap } from "@/src/types/capa-simulation";
import {
  DEFAULT_SHIFT_SELECTION,
  type ShiftSelection,
  type SimulationCalendar,
} from "@/src/types/capa-shift";

function cloneDefaultShiftSelection(): ShiftSelection {
  return {
    weekday: [...DEFAULT_SHIFT_SELECTION.weekday],
    weekend: [...DEFAULT_SHIFT_SELECTION.weekend],
  };
}

export type SingleSimulatorState = {
  recipe: CapaRecipe | null;
  overrides: RecipeOverrideMap;
  targetQty: number;
  shiftSelection: ShiftSelection;
  shiftConfigured: boolean;
  calendar: SimulationCalendar;
  selectedProcessId: string | null;
};

export const initialSingleSimulatorState: SingleSimulatorState = {
  recipe: null,
  overrides: {},
  targetQty: 0,
  shiftSelection: cloneDefaultShiftSelection(),
  shiftConfigured: true,
  calendar: simulationCalendar(5, todayYmd()),
  selectedProcessId: null,
};

export type SingleSimulatorAction =
  | { type: "LOAD_RECIPE"; recipe: CapaRecipe }
  | { type: "SET_TARGET_QTY"; qty: number }
  | { type: "SET_SHIFT_SELECTION"; selection: ShiftSelection }
  | { type: "CONFIRM_SHIFT" }
  | { type: "SET_CALENDAR"; calendar: SimulationCalendar }
  | {
      type: "SET_PROCESS_OVERRIDE";
      processId: string;
      patch: RecipeOverrideMap[string];
    }
  | { type: "CLEAR_OVERRIDES" }
  | { type: "SELECT_PROCESS"; processId: string | null }
  | { type: "SET_ARRAY_MULTIPLIER"; value: number };

export function singleSimulatorReducer(
  state: SingleSimulatorState,
  action: SingleSimulatorAction
): SingleSimulatorState {
  switch (action.type) {
    case "LOAD_RECIPE":
      return {
        ...state,
        recipe: action.recipe,
        overrides: {},
        shiftSelection: cloneDefaultShiftSelection(),
        shiftConfigured: true,
        selectedProcessId: action.recipe.processes[0]?.id ?? null,
      };
    case "SET_TARGET_QTY":
      return { ...state, targetQty: action.qty };
    case "SET_SHIFT_SELECTION":
      return { ...state, shiftSelection: action.selection };
    case "CONFIRM_SHIFT":
      return { ...state, shiftConfigured: true };
    case "SET_CALENDAR":
      return { ...state, calendar: action.calendar };
    case "SET_PROCESS_OVERRIDE": {
      const prev = state.overrides[action.processId] ?? {};
      return {
        ...state,
        overrides: {
          ...state.overrides,
          [action.processId]: { ...prev, ...action.patch },
        },
      };
    }
    case "CLEAR_OVERRIDES":
      return { ...state, overrides: {} };
    case "SELECT_PROCESS":
      return { ...state, selectedProcessId: action.processId };
    case "SET_ARRAY_MULTIPLIER": {
      if (!state.recipe) return state;
      const arrayMultiplier = normalizeArrayMultiplier(action.value);
      return {
        ...state,
        recipe: {
          ...state.recipe,
          meta: { ...state.recipe.meta, arrayMultiplier },
        },
      };
    }
    default:
      return state;
  }
}
