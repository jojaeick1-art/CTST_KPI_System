"use client";

import { useCallback, useReducer, useState } from "react";
import { GripVertical, Loader2, Plus, Save, Upload } from "lucide-react";
import { CapaPageShell } from "@/src/components/capa/capa-page-shell";
import { useDashboardProfile } from "@/src/hooks/useKpiQueries";
import { canManageCapaRecipe } from "@/src/lib/rbac";
import {
  initialRecipeMasterState,
  recipeMasterReducer,
} from "@/src/hooks/capa/recipe-master-reducer";
import { createEmptyCapaRecipe } from "@/src/lib/capa";
import { createDefaultProcess } from "@/src/lib/capa/recipe-normalize";
import {
  listCapaRecipeCatalog,
  loadCapaRecipeWithWidgetSync,
  saveCapaRecipeToLocal,
  type CapaRecipeCatalogItem,
} from "@/src/lib/capa-recipe-transfer";
import { RecipeLoadPicker } from "@/src/components/capa/recipe-load-picker";
import {
  capaInputClass,
  capaInputClassFull,
  capaMetricInputClass,
} from "@/src/components/capa/capa-input-classes";
import {
  ProcessThroughputInput,
  type ThroughputInputMode,
} from "@/src/components/capa/process-throughput-input";

export function RecipeMasterClient() {
  const profileQ = useDashboardProfile();
  const role = profileQ.data?.profile.role ?? "";
  const canManage = canManageCapaRecipe(role);

  const [state, dispatch] = useReducer(recipeMasterReducer, initialRecipeMasterState);
  const [dragId, setDragId] = useState<string | null>(null);
  const [throughputMode, setThroughputMode] = useState<ThroughputInputMode>("ct");
  const [loadPickerOpen, setLoadPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState<CapaRecipeCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectingPath, setSelectingPath] = useState<string | null>(null);

  const draft = state.draft;
  const selectedProcess = draft?.processes.find((p) => p.id === state.selectedProcessId);

  const openLoadPicker = useCallback(async () => {
    setLoadPickerOpen(true);
    setCatalogLoading(true);
    setCatalog([]);
    try {
      const items = await listCapaRecipeCatalog();
      setCatalog(items);
    } catch (e) {
      setLoadPickerOpen(false);
      dispatch({
        type: "TRANSFER_ERROR",
        message: e instanceof Error ? e.message : "레시피 목록 조회 실패",
      });
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const handleSelectRecipe = useCallback(async (storagePath: string) => {
    setSelectingPath(storagePath);
    dispatch({ type: "TRANSFER_START", mode: "loading" });
    try {
      const recipe = await loadCapaRecipeWithWidgetSync(storagePath);
      dispatch({ type: "LOAD_RECIPE", recipe });
      setLoadPickerOpen(false);
    } catch (e) {
      dispatch({
        type: "TRANSFER_ERROR",
        message: e instanceof Error ? e.message : "불러오기 실패",
      });
    } finally {
      setSelectingPath(null);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    dispatch({ type: "TRANSFER_START", mode: "saving" });
    try {
      await saveCapaRecipeToLocal(draft);
      dispatch({ type: "TRANSFER_DONE" });
    } catch (e) {
      dispatch({
        type: "TRANSFER_ERROR",
        message: e instanceof Error ? e.message : "저장 실패",
      });
    }
  }, [draft]);

  if (!canManage) {
    return (
      <CapaPageShell
        title="레시피 마스터"
        description="그룹장·팀장 권한이 필요합니다."
      >
        <p className="text-sm text-slate-600">접근 권한이 없습니다.</p>
      </CapaPageShell>
    );
  }

  function onDragStart(processId: string) {
    setDragId(processId);
  }

  function onDrop(targetId: string) {
    if (!draft || !dragId || dragId === targetId) return;
    const ids = draft.processes.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    dispatch({ type: "REORDER_PROCESSES", processIds: next });
    setDragId(null);
  }

  function addProcess() {
    if (!draft) return;
    const next = createDefaultProcess(draft.processes.length + 1);
    dispatch({ type: "ADD_PROCESS", process: next });
  }

  const loadPicker = (
    <RecipeLoadPicker
      open={loadPickerOpen}
      loading={catalogLoading}
      items={catalog}
      selectingPath={selectingPath}
      hint="선택한 레시피를 편집 화면에 불러옵니다."
      onClose={() => setLoadPickerOpen(false)}
      onSelect={(path) => void handleSelectRecipe(path)}
    />
  );

  if (!draft) {
    return (
      <CapaPageShell title="레시피 마스터">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => dispatch({ type: "LOAD_RECIPE", recipe: createEmptyCapaRecipe() })}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            새 레시피
          </button>
          <button
            type="button"
            onClick={() => void openLoadPicker()}
            disabled={catalogLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {catalogLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            불러오기
          </button>
        </div>
        {state.transferMessage ? (
          <p className="mt-4 text-sm text-red-600">{state.transferMessage}</p>
        ) : null}
        {loadPicker}
      </CapaPageShell>
    );
  }

  return (
    <CapaPageShell title="레시피 마스터">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void openLoadPicker()}
          disabled={catalogLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          <Upload className="h-4 w-4" />
          불러오기
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={state.transferStatus === "saving"}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          {state.transferStatus === "saving" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          저장
        </button>
        {state.isDirty ? (
          <button
            type="button"
            onClick={() => dispatch({ type: "RESET_DRAFT" })}
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            변경 취소
          </button>
        ) : null}
      </div>

      {state.transferMessage ? (
        <p className="mb-4 text-sm text-red-600">{state.transferMessage}</p>
      ) : null}

      {loadPicker}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 rounded-2xl border border-sky-200 bg-white p-4 shadow-sm lg:w-[420px]">
          <label className="text-xs font-semibold uppercase text-slate-500">레시피명</label>
          <input
            className={`mt-1 ${capaInputClassFull}`}
            value={draft.meta.name}
            onChange={(e) =>
              dispatch({ type: "UPDATE_META", patch: { name: e.target.value } })
            }
          />
          {draft.meta.lineTopology ? (
            <p className="mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800 ring-1 ring-sky-200">
              라인 구성:{" "}
              {draft.meta.lineTopology === "serial" ? "직렬" : "병렬"}
            </p>
          ) : null}
          {draft.meta.description ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{draft.meta.description}</p>
          ) : null}
          <p className="mt-4 text-xs font-semibold uppercase text-slate-500">공정 (드래그 정렬)</p>
          <button
            type="button"
            onClick={addProcess}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-sky-300 bg-sky-50 py-2 text-xs font-medium text-sky-800 hover:bg-sky-100"
          >
            <Plus className="h-3.5 w-3.5" />
            공정 추가
          </button>
          <ul className="mt-2 space-y-1">
            {draft.processes.map((p) => (
              <li
                key={p.id}
                draggable
                onDragStart={() => onDragStart(p.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(p.id)}
                onClick={() => dispatch({ type: "SELECT_PROCESS", processId: p.id })}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-800 ${
                  p.id === state.selectedProcessId
                    ? "bg-sky-50 font-medium text-sky-950 ring-1 ring-sky-300"
                    : "hover:bg-slate-100"
                }`}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">{p.processName}</span>
              </li>
            ))}
          </ul>
        </aside>

        <section className="min-w-0 flex-1 rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
          {selectedProcess ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-800">공정 편집</h2>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ type: "REMOVE_PROCESS", processId: selectedProcess.id })
                  }
                  className="shrink-0 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  이 공정 삭제
                </button>
              </div>
              <div className="flex w-full flex-col flex-wrap items-end gap-5 sm:flex-row sm:gap-8">
                <label className="block min-w-0 basis-0 sm:flex-[3]">
                  <span className="text-xs font-medium text-slate-600">공정명</span>
                  <input
                    className={`mt-1 block w-full ${capaInputClass}`}
                    value={selectedProcess.processName}
                    onChange={(ev) =>
                      dispatch({
                        type: "UPDATE_PROCESS",
                        processId: selectedProcess.id,
                        patch: { processName: ev.target.value },
                      })
                    }
                  />
                </label>
                <div className="shrink-0">
                  <ProcessThroughputInput
                    ctSec={selectedProcess.ctSec}
                    mode={throughputMode}
                    onModeChange={setThroughputMode}
                    onCtSecChange={(ctSec) =>
                      dispatch({
                        type: "UPDATE_PROCESS",
                        processId: selectedProcess.id,
                        patch: { ctSec },
                      })
                    }
                  />
                </div>
                <label className="block shrink-0">
                  <span className="text-xs font-medium text-slate-600">설비 대수</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={capaMetricInputClass}
                    value={selectedProcess.equipmentCount}
                    onChange={(ev) => {
                      const n = Math.max(1, Math.floor(Number(ev.target.value)) || 1);
                      dispatch({
                        type: "UPDATE_PROCESS",
                        processId: selectedProcess.id,
                        patch: { equipmentCount: n },
                      });
                    }}
                  />
                </label>
                <label className="block shrink-0">
                  <span className="text-xs font-medium text-slate-600">가동률 (%)</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className={capaMetricInputClass}
                    value={Math.round(selectedProcess.defaultUptimeRate * 100)}
                    onChange={(ev) =>
                      dispatch({
                        type: "UPDATE_PROCESS",
                        processId: selectedProcess.id,
                        patch: {
                          defaultUptimeRate: Number(ev.target.value) / 100,
                        },
                      })
                    }
                  />
                </label>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">왼쪽에서 공정을 선택하거나 추가하세요.</p>
          )}
        </section>
      </div>
    </CapaPageShell>
  );
}
