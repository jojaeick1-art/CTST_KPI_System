"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, X } from "lucide-react";
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
import { useCapaSimulation } from "@/src/hooks/capa/use-capa-simulation";
import {
  listCapaRecipeCatalog,
  listCapaProcessGroups,
  loadCapaRecipeFromStorage,
  type CapaProcessGroup,
  type CapaRecipeCatalogItem,
} from "@/src/lib/capa-recipe-transfer";
import {
  normalizeArrayMultiplier,
  resolveArrayMultiplier,
} from "@/src/lib/capa/recipe-normalize";
import { computeLinePeriodCapa } from "@/src/lib/capa/period-capa";
import { effectiveShiftSelection, hasEffectiveShiftSelection } from "@/src/lib/capa/shift-effective";
import { DEFAULT_SHIFT_SELECTION } from "@/src/types/capa-shift";
import type { CapaRecipe } from "@/src/types/capa-recipe";

type RecipeEntry = {
  catalog: CapaRecipeCatalogItem;
  recipe: CapaRecipe;
};

const STANDARD_MONTH_DAYS = 26;
const STANDARD_YEAR_DAYS = 312;
const ALL_PROCESS_LABEL = "전체";

function formatNum(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

export function ProcessHubClient() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<RecipeEntry[]>([]);
  const [groups, setGroups] = useState<CapaProcessGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedProcess, setSelectedProcess] = useState<string>(ALL_PROCESS_LABEL);
  const [processDropdownOpen, setProcessDropdownOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<CapaRecipe | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const groupRows = await listCapaProcessGroups();
        if (mounted) setGroups(groupRows);
        const catalog = await listCapaRecipeCatalog();
        const loaded: RecipeEntry[] = [];
        for (const item of catalog) {
          try {
            const recipe = await loadCapaRecipeFromStorage(item.storagePath);
            loaded.push({ catalog: item, recipe });
          } catch {
            // 손상/누락 모델은 목록에서 제외
          }
        }
        if (mounted) setEntries(loaded);
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : "공정 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const processNames = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      const n = g.name.trim();
      if (n) set.add(n);
    }
    for (const entry of entries) {
      const n = (entry.catalog.processGroup || "").trim();
      if (n) set.add(n);
    }
    return [...set];
  }, [groups, entries]);

  const filtered = useMemo(() => {
    if (selectedProcess === ALL_PROCESS_LABEL) return entries;
    return entries.filter(
      (entry) => (entry.catalog.processGroup || "SMT") === selectedProcess,
    );
  }, [entries, selectedProcess]);

  const statsByProcess = useMemo(() => {
    const map = new Map<
      string,
      { count: number; latestUpdatedAt: string | null }
    >();
    for (const name of processNames) {
      map.set(name, { count: 0, latestUpdatedAt: null });
    }
    for (const entry of entries) {
      const key = entry.catalog.processGroup || "SMT";
      const prev = map.get(key) ?? { count: 0, latestUpdatedAt: null };
      const nextCount = prev.count + 1;
      const latest =
        !prev.latestUpdatedAt ||
        new Date(entry.catalog.updatedAt).getTime() >
          new Date(prev.latestUpdatedAt).getTime()
          ? entry.catalog.updatedAt
          : prev.latestUpdatedAt;
      map.set(key, { count: nextCount, latestUpdatedAt: latest });
    }
    map.set(ALL_PROCESS_LABEL, {
      count: entries.length,
      latestUpdatedAt:
        entries
          .map((entry) => entry.catalog.updatedAt)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null,
    });
    return map;
  }, [entries, processNames]);

  function formatDate(value: string | null): string {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("ko-KR");
  }

  const selectedProcessInfo =
    selectedProcess === ALL_PROCESS_LABEL
      ? {
          name: ALL_PROCESS_LABEL,
          createdAt:
            entries
              .map((entry) => entry.catalog.createdAt)
              .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null,
          createdByName: null as string | null,
        }
      : groups.find((g) => g.name === selectedProcess) ?? {
          name: selectedProcess,
          createdAt: null,
          createdByName: null as string | null,
        };

  return (
    <CapaPageShell
      title="공정"
      description="공정을 선택한 뒤 해당 공정에 등록된 모델과 CAPA를 확인하세요."
      meta="기준: 월 26일 근무 · 평일 8h×3 · 주말 12h×2 (일 22.5h 가동)"
    >
      <RecipeSimulatorModal
        recipe={selectedRecipe}
        onClose={() => setSelectedRecipe(null)}
      />

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
          모델·공정 목록을 불러오는 중…
        </div>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {error}
        </p>
      ) : (
        <>
          <div className="mb-6 rounded-2xl border border-sky-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setProcessDropdownOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-sky-50/70 px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  공정 선택
                </p>
                <p className="truncate text-base font-semibold text-slate-900">
                  {selectedProcess}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  작성자 {selectedProcessInfo.createdByName ?? "-"} · 작성일{" "}
                  {formatDate(selectedProcessInfo.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-sky-200">
                  모델 수 {statsByProcess.get(selectedProcess)?.count ?? 0}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-sky-700 transition-transform ${
                    processDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>
            <div
              className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out ${
                processDropdownOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="min-h-0">
                <div className="grid gap-2 border-t border-sky-100 bg-white px-3 py-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[ALL_PROCESS_LABEL, ...processNames].map((name) => {
                    const stat = statsByProcess.get(name) ?? {
                      count: 0,
                      latestUpdatedAt: null,
                    };
                    const selected = selectedProcess === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setSelectedProcess(name);
                          setProcessDropdownOpen(false);
                        }}
                        className={`rounded-xl border-l-4 px-3 py-2 text-left transition ${
                          selected
                            ? "border-l-sky-500 border-sky-300 bg-sky-50 text-sky-900"
                            : "border-l-emerald-400 border-slate-200 bg-emerald-50/70 text-emerald-900 hover:border-sky-200 hover:bg-sky-50/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{name}</span>
                          <span className="text-xs font-semibold text-slate-700">
                            모델 수 {stat.count}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600">
                          최근 작성일 {formatDate(stat.latestUpdatedAt)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500">
              선택한 공정의 모델이 없습니다. `등록` 메뉴에서 공정/모델을 추가해 주세요.
            </p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((entry) => {
                const period = computeLinePeriodCapa({
                  recipe: entry.recipe,
                  shiftSelection: DEFAULT_SHIFT_SELECTION,
                  monthDays: STANDARD_MONTH_DAYS,
                  yearDays: STANDARD_YEAR_DAYS,
                });
                return (
                  <li key={entry.catalog.storagePath}>
                    <button
                      type="button"
                      onClick={() => setSelectedRecipe(entry.recipe)}
                      className="w-full rounded-2xl border border-sky-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="text-base font-semibold text-slate-900">
                          {entry.recipe.meta.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          공정 {entry.recipe.processes.length} · 작성자{" "}
                          {entry.catalog.createdByName ?? "-"} · 작성일{" "}
                          {new Date(entry.catalog.createdAt).toLocaleDateString("ko-KR")} ·
                          최종업데이트{" "}
                          {new Date(entry.catalog.updatedAt).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <p className="rounded-lg bg-sky-50 px-2.5 py-2 text-sm text-slate-700 ring-1 ring-sky-100">
                          일 CAPA <span className="font-semibold text-slate-900">{formatNum(period.daily)}</span>
                        </p>
                        <p className="rounded-lg bg-sky-50 px-2.5 py-2 text-sm text-slate-700 ring-1 ring-sky-100">
                          월 CAPA <span className="font-semibold text-slate-900">{formatNum(period.monthly)}</span>
                        </p>
                        <p className="rounded-lg bg-sky-50 px-2.5 py-2 text-sm text-slate-700 ring-1 ring-sky-100">
                          년 CAPA <span className="font-semibold text-slate-900">{formatNum(period.yearly)}</span>
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </CapaPageShell>
  );
}

function RecipeSimulatorModal({
  recipe,
  onClose,
}: {
  recipe: CapaRecipe | null;
  onClose: () => void;
}) {
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [arrayMultiplier, setArrayMultiplier] = useState(1);
  const [targetQty, setTargetQty] = useState(0);
  const [workDays, setWorkDays] = useState(STANDARD_MONTH_DAYS);
  const [shiftSelection, setShiftSelection] = useState(DEFAULT_SHIFT_SELECTION);
  const [shiftConfigured, setShiftConfigured] = useState(true);
  const [weekdayRun, setWeekdayRun] = useState(true);
  const [weekendRun, setWeekendRun] = useState(true);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);

  const recipeWithArray = useMemo(() => {
    if (!recipe) return null;
    return {
      ...recipe,
      meta: {
        ...recipe.meta,
        arrayMultiplier: normalizeArrayMultiplier(arrayMultiplier),
      },
    };
  }, [recipe, arrayMultiplier]);

  const period = useMemo(() => {
    if (!recipeWithArray) return null;
    return computeLinePeriodCapa({
      recipe: recipeWithArray,
      shiftSelection: effectiveShiftSelection(
        shiftSelection,
        weekdayRun,
        weekendRun,
      ),
      monthDays: STANDARD_MONTH_DAYS,
      yearDays: STANDARD_YEAR_DAYS,
    });
  }, [recipeWithArray, shiftSelection, weekdayRun, weekendRun]);

  const effectiveShift = useMemo(
    () => effectiveShiftSelection(shiftSelection, weekdayRun, weekendRun),
    [shiftSelection, weekdayRun, weekendRun],
  );

  const shiftSummary = useMemo(
    () => formatShiftSelectionSummary(shiftSelection, weekdayRun, weekendRun),
    [shiftSelection, weekdayRun, weekendRun],
  );

  useEffect(() => {
    if (!recipe) return;
    const baseArray = resolveArrayMultiplier(recipe.meta);
    setArrayMultiplier(baseArray);
    setShiftSelection(DEFAULT_SHIFT_SELECTION);
    setShiftConfigured(true);
    setWeekdayRun(true);
    setWeekendRun(true);
    setWorkDays(STANDARD_MONTH_DAYS);
    const basePeriod = computeLinePeriodCapa({
      recipe: {
        ...recipe,
        meta: { ...recipe.meta, arrayMultiplier: baseArray },
      },
      shiftSelection: DEFAULT_SHIFT_SELECTION,
      monthDays: STANDARD_MONTH_DAYS,
      yearDays: STANDARD_YEAR_DAYS,
    });
    setTargetQty(basePeriod.monthly);
  }, [recipe]);

  const 기준Period = useMemo(() => {
    if (!recipe) return null;
    return computeLinePeriodCapa({
      recipe,
      shiftSelection: DEFAULT_SHIFT_SELECTION,
      monthDays: STANDARD_MONTH_DAYS,
      yearDays: STANDARD_YEAR_DAYS,
    });
  }, [recipe]);

  const { result, processResult } = useCapaSimulation({
    recipe: recipeWithArray,
    targetQty,
    shiftSelection,
    shiftConfigured,
    workDays,
    weekdayRun,
    weekendRun,
    overrides: {},
  });

  useEffect(() => {
    setSelectedProcessId(recipe?.processes[0]?.id ?? null);
  }, [recipe]);

  if (!recipe || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{recipe.meta.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-6 overflow-y-auto px-5 py-5">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3 text-sm text-sky-900">
              <p className="font-semibold">기준 모델 조건</p>
              <p className="mt-1">
                월 26일 근무, 평일 8h x 3, 주말 12h x 2 (1일 22.5h 가동)
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <CapaSimulationParamsFields
                arrayMultiplier={arrayMultiplier}
                onArrayMultiplierChange={setArrayMultiplier}
                workDays={workDays}
                onWorkDaysChange={setWorkDays}
                targetQty={targetQty}
                onTargetQtyChange={setTargetQty}
                shiftSummary={shiftSummary}
                onOpenShiftModal={() => setShiftModalOpen(true)}
                layoutClassName="flex flex-wrap items-end gap-3"
                arrayWidthClassName="w-[5.5rem]"
                workDaysWidthClassName="w-[5.5rem]"
                targetWidthClassName="w-[5.5rem]"
              />
            </div>
          </div>
          {result ? <CapaLineCapaResultCard result={result} /> : null}
          <ShiftSelectionModal
            open={shiftModalOpen}
            value={shiftSelection}
            weekdayRun={weekdayRun}
            weekendRun={weekendRun}
            onChange={setShiftSelection}
            onWeekdayRunChange={setWeekdayRun}
            onWeekendRunChange={setWeekendRun}
            onClose={() => setShiftModalOpen(false)}
            onConfirm={() => {
              if (
                hasEffectiveShiftSelection(shiftSelection, weekdayRun, weekendRun)
              ) {
                setShiftConfigured(true);
                setShiftModalOpen(false);
              }
            }}
          />
          <CapaPeriodCapaPanel
            recipe={recipe}
            simulationRecipe={recipeWithArray}
            shiftConfigured={shiftConfigured}
            shiftSelection={effectiveShift}
            workDays={workDays}
            overrides={{}}
          />
          {result ? (
            <ProcessFlowView
              processes={result.processes}
              selectedProcessId={selectedProcessId}
              scheduleSufficient={
                result.requiredCalendarDays <= result.periodCalendarDays
              }
              onSelectProcess={setSelectedProcessId}
            />
          ) : null}
          <ProcessDetailPanel
            processes={processResult?.processes ?? []}
            selectedProcessId={selectedProcessId}
            sandboxMode
            onSelectProcess={setSelectedProcessId}
            onOverride={() => {
              // 공정 메뉴는 조회 전용
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
