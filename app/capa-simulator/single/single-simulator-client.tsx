"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { CapaPageShell } from "@/src/components/capa/capa-page-shell";
import { CapaLineCapaResultCard } from "@/src/components/capa/capa-line-capa-result-card";
import { CapaPeriodCapaPanel } from "@/src/components/capa/capa-period-capa-panel";
import { CapaSimulationParamsFields } from "@/src/components/capa/capa-simulation-params-fields";
import { ProcessDetailPanel } from "@/src/components/capa/process-detail-panel";
import { ProcessFlowView } from "@/src/components/capa/process-flow-view";
import {
  formatShiftSelectionSummary,
  ShiftSelectionModal,
} from "@/src/components/capa/shift-selection-modal";
import {
  initialSingleSimulatorState,
  singleSimulatorReducer,
} from "@/src/hooks/capa/single-simulator-reducer";
import { useCapaSimulation } from "@/src/hooks/capa/use-capa-simulation";
import { RecipeLoadPicker } from "@/src/components/capa/recipe-load-picker";
import {
  listCapaRecipeCatalog,
  loadCapaRecipeWithWidgetSync,
  type CapaRecipeCatalogItem,
} from "@/src/lib/capa-recipe-transfer";
import {
  capaToolbarPrimaryButtonClass,
  capaToolbarRecipeNameClass,
} from "@/src/components/capa/capa-input-classes";
import {
  normalizeArrayMultiplier,
  resolveArrayMultiplier,
} from "@/src/lib/capa/recipe-normalize";
import {
  effectiveShiftSelection,
  hasEffectiveShiftSelection,
} from "@/src/lib/capa/shift-effective";
import {
  CapaSimulatorGuideCallout,
  CapaSimulatorGuideHighlight,
} from "@/src/components/capa/capa-simulator-guide-callout";

type SimulatorGuideStep = "load-recipe" | "set-params" | "hidden";

export function SingleSimulatorClient() {
  const [state, dispatch] = useReducer(
    singleSimulatorReducer,
    initialSingleSimulatorState
  );
  const [loadPickerOpen, setLoadPickerOpen] = useState(false);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [catalog, setCatalog] = useState<CapaRecipeCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectingPath, setSelectingPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [weekdayRun, setWeekdayRun] = useState(true);
  const [weekendRun, setWeekendRun] = useState(true);
  const [workDays, setWorkDays] = useState(5);
  const [guideSkipped, setGuideSkipped] = useState(false);
  const [guideStep, setGuideStep] = useState<SimulatorGuideStep>("load-recipe");

  const paramsReady =
    state.shiftConfigured && state.targetQty > 0;

  useEffect(() => {
    if (guideSkipped) {
      setGuideStep("hidden");
      return;
    }
    if (!state.recipe) {
      setGuideStep("load-recipe");
      return;
    }
    if (!paramsReady) {
      setGuideStep("set-params");
      return;
    }
    setGuideStep("hidden");
  }, [state.recipe, paramsReady, guideSkipped]);

  const effectiveShift = useMemo(
    () =>
      effectiveShiftSelection(
        state.shiftSelection,
        weekdayRun,
        weekendRun
      ),
    [state.shiftSelection, weekdayRun, weekendRun]
  );

  const { result, processResult } = useCapaSimulation({
    recipe: state.recipe,
    targetQty: state.targetQty,
    shiftSelection: state.shiftSelection,
    shiftConfigured: state.shiftConfigured,
    workDays,
    weekdayRun,
    weekendRun,
    overrides: state.overrides,
  });

  const shiftSummary = useMemo(
    () =>
      formatShiftSelectionSummary(
        state.shiftSelection,
        weekdayRun,
        weekendRun
      ),
    [state.shiftSelection, weekdayRun, weekendRun]
  );

  const openLoadPicker = useCallback(async () => {
    setLoadPickerOpen(true);
    setCatalogLoading(true);
    setCatalog([]);
    setLoadError(null);
    try {
      const items = await listCapaRecipeCatalog();
      setCatalog(items);
    } catch (e) {
      setLoadPickerOpen(false);
      setLoadError(e instanceof Error ? e.message : "레시피 목록 조회 실패");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const handleSelectRecipe = useCallback(async (storagePath: string) => {
    setSelectingPath(storagePath);
    setLoadError(null);
    try {
      const recipe = await loadCapaRecipeWithWidgetSync(storagePath);
      dispatch({ type: "LOAD_RECIPE", recipe });
      setLoadPickerOpen(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setSelectingPath(null);
    }
  }, []);

  return (
    <CapaPageShell title="CAPA 시뮬레이터">
      <div className="mb-6 overflow-visible rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1 xl:min-w-[480px]">
            <span className="text-xs font-medium text-slate-600">레시피</span>
            <div className="flex items-center gap-3">
              <CapaSimulatorGuideHighlight
                active={guideStep === "load-recipe"}
                className="relative shrink-0"
              >
                <CapaSimulatorGuideCallout
                  show={guideStep === "load-recipe"}
                  step={1}
                  totalSteps={2}
                  title="레시피를 불러오세요"
                  body="시뮬레이션할 레시피 파일을 선택합니다. 먼저 이 버튼을 눌러 주세요."
                  onSkip={() => setGuideSkipped(true)}
                  offsetClassName="mt-4"
                />
                <button
                type="button"
                onClick={() => void openLoadPicker()}
                disabled={catalogLoading}
                className={capaToolbarPrimaryButtonClass}
              >
                {catalogLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                레시피 불러오기
                </button>
              </CapaSimulatorGuideHighlight>
              <div
                className={capaToolbarRecipeNameClass}
                title={state.recipe?.meta.name}
              >
                {state.recipe ? (
                  <p className="truncate font-medium text-slate-700">
                    {state.recipe.meta.name}
                  </p>
                ) : (
                  <p className="truncate text-slate-400">레시피 미선택</p>
                )}
              </div>
            </div>
          </div>

          <CapaSimulatorGuideHighlight
            active={guideStep === "set-params"}
            className="relative flex flex-wrap items-end gap-4"
          >
            <CapaSimulatorGuideCallout
              show={guideStep === "set-params"}
              step={2}
              totalSteps={2}
              title="시뮬 조건을 입력하세요"
              body="월 근무일수·목표 수량을 입력하고, 근무조 버튼을 눌러 교대를 선택한 뒤 확인을 눌러 주세요."
              onSkip={() => setGuideSkipped(true)}
              align="end"
            />
            <CapaSimulationParamsFields
              arrayMultiplier={
                state.recipe
                  ? resolveArrayMultiplier(state.recipe.meta)
                  : 1
              }
              onArrayMultiplierChange={(value) =>
                dispatch({
                  type: "SET_ARRAY_MULTIPLIER",
                  value: normalizeArrayMultiplier(value),
                })
              }
              arrayDisabled={!state.recipe}
              workDays={workDays}
              onWorkDaysChange={setWorkDays}
              targetQty={state.targetQty}
              onTargetQtyChange={(qty) =>
                dispatch({ type: "SET_TARGET_QTY", qty })
              }
              shiftSummary={shiftSummary}
              shiftPlaceholder={
                !state.shiftConfigured ? "근무조를 선택해 주세요" : undefined
              }
              onOpenShiftModal={() => setShiftModalOpen(true)}
            />
          </CapaSimulatorGuideHighlight>

          {Object.keys(state.overrides).length > 0 ? (
            <button
              type="button"
              className="self-end pb-2.5 text-sm text-sky-700 underline xl:ml-auto"
              onClick={() => dispatch({ type: "CLEAR_OVERRIDES" })}
            >
              What-If 변경 초기화
            </button>
          ) : null}
        </div>

        {loadError ? (
          <p className="mt-3 text-sm text-red-600">{loadError}</p>
        ) : null}
      </div>

      <section className="min-w-0 space-y-6">
        {result ? (
          <CapaLineCapaResultCard result={result} />
        ) : state.recipe ? (
          <p className="text-sm text-slate-500">
            {!state.shiftConfigured
              ? "근무조를 선택하고 목표 수량을 입력하면 CAPA를 계산합니다."
              : "목표 수량을 입력하면 CAPA를 계산합니다."}
          </p>
        ) : (
          <p className="text-sm text-slate-500">
            레시피를 불러오고 목표 수량을 입력하면 CAPA를 계산합니다.
          </p>
        )}

        <CapaPeriodCapaPanel
          recipe={state.recipe}
          shiftConfigured={state.shiftConfigured}
          shiftSelection={effectiveShift}
          workDays={workDays}
          overrides={state.overrides}
        />

        {result ? (
          <ProcessFlowView
            processes={result.processes}
            selectedProcessId={state.selectedProcessId}
            scheduleSufficient={
              result.requiredCalendarDays <= result.periodCalendarDays
            }
            onSelectProcess={(id) =>
              dispatch({ type: "SELECT_PROCESS", processId: id })
            }
          />
        ) : null}

        <ProcessDetailPanel
          processes={processResult?.processes ?? []}
          selectedProcessId={state.selectedProcessId}
          arrayMultiplier={resolveArrayMultiplier(state.recipe?.meta)}
          sandboxMode
          onSelectProcess={(id) =>
            dispatch({ type: "SELECT_PROCESS", processId: id })
          }
          onOverride={(processId, patch) =>
            dispatch({ type: "SET_PROCESS_OVERRIDE", processId, patch })
          }
        />
      </section>

      <RecipeLoadPicker
        open={loadPickerOpen}
        loading={catalogLoading}
        items={catalog}
        selectingPath={selectingPath}
        hint="선택한 레시피로 시뮬레이션을 실행합니다."
        onClose={() => setLoadPickerOpen(false)}
        onSelect={(path) => void handleSelectRecipe(path)}
      />

      <ShiftSelectionModal
        open={shiftModalOpen}
        value={state.shiftSelection}
        weekdayRun={weekdayRun}
        weekendRun={weekendRun}
        onChange={(sel) =>
          dispatch({ type: "SET_SHIFT_SELECTION", selection: sel })
        }
        onWeekdayRunChange={setWeekdayRun}
        onWeekendRunChange={setWeekendRun}
        onClose={() => setShiftModalOpen(false)}
        onConfirm={() => {
          if (
            hasEffectiveShiftSelection(
              state.shiftSelection,
              weekdayRun,
              weekendRun
            )
          ) {
            dispatch({ type: "CONFIRM_SHIFT" });
          }
        }}
      />
    </CapaPageShell>
  );
}
