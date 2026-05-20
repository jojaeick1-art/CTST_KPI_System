import { simulationCalendar, todayYmd } from "@/src/lib/capa/shift-calendar";
import type { CapaRecipe } from "@/src/types/capa-recipe";
import type { RecipeOverrideMap } from "@/src/types/capa-simulation";
import type { ShiftSelection, SimulationCalendar } from "@/src/types/capa-shift";

const EMPTY_SHIFT_SELECTION: ShiftSelection = {
  weekday: [],
  weekend: [],
};

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
  shiftSelection: { ...EMPTY_SHIFT_SELECTION },
  shiftConfigured: false,
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
  | { type: "SELECT_PROCESS"; processId: string | null };

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
        shiftSelection: { ...EMPTY_SHIFT_SELECTION },
        shiftConfigured: false,
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
    default:
      return state;
  }
}
