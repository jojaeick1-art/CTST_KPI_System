"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { CapaPageShell } from "@/src/components/capa/capa-page-shell";
import {
  initialRecipeMasterState,
  recipeMasterReducer,
} from "@/src/hooks/capa/recipe-master-reducer";
import { createEmptyCapaRecipe } from "@/src/lib/capa";
import {
  createDefaultProcess,
  normalizeArrayMultiplier,
  resolveArrayMultiplier,
} from "@/src/lib/capa/recipe-normalize";
import type { CapaRecipe } from "@/src/types/capa-recipe";
import {
  createCapaProcessGroup,
  deleteCapaProcessGroup,
  deleteCapaRecipeCatalogItem,
  listCapaProcessGroups,
  listCapaRecipeCatalog,
  loadCapaRecipeWithWidgetSync,
  saveCapaRecipeToLocal,
  updateCapaProcessGroup,
  type CapaProcessGroup,
  type CapaRecipeCatalogItem,
} from "@/src/lib/capa-recipe-transfer";
import {
  capaInputClass,
  capaInputClassFull,
  capaMetricInputClass,
} from "@/src/components/capa/capa-input-classes";
import {
  ProcessThroughputInput,
  type ThroughputInputMode,
} from "@/src/components/capa/process-throughput-input";
import { useDashboardProfile } from "@/src/hooks/useKpiQueries";
import { canManageCapaRecipe } from "@/src/lib/rbac";

type ManageMode = "process" | "recipe";

type ProcessDraft = {
  id: string;
  name: string;
  sortOrder: number;
  createdByName: string | null;
  createdAt: string;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR");
}

function recipeFingerprint(recipe: CapaRecipe | null | undefined): string {
  if (!recipe) return "";
  return JSON.stringify({
    meta: {
      name: recipe.meta.name,
      processGroup: recipe.meta.processGroup ?? "",
      arrayMultiplier: resolveArrayMultiplier(recipe.meta),
    },
    processes: recipe.processes.map((p) => ({
      id: p.id,
      processName: p.processName,
      ctSec: p.ctSec,
      defaultUptimeRate: p.defaultUptimeRate,
      equipmentCount: p.equipmentCount,
    })),
  });
}

export function RecipeMasterClient({ pageTitle = "모델 마스터" }: { pageTitle?: string }) {
  const profileQ = useDashboardProfile();
  const role = profileQ.data?.profile.role ?? "";
  const canManage = canManageCapaRecipe(role);

  const [mode, setMode] = useState<ManageMode>("process");
  const [groups, setGroups] = useState<CapaProcessGroup[]>([]);
  const [catalog, setCatalog] = useState<CapaRecipeCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingProcess, setSavingProcess] = useState(false);
  const [reorderingProcess, setReorderingProcess] = useState(false);
  const [throughputMode, setThroughputMode] = useState<ThroughputInputMode>("ct");
  const [processDraft, setProcessDraft] = useState<ProcessDraft | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [recipeFilterGroup, setRecipeFilterGroup] = useState<string>("SMT");
  const [selectedRecipePath, setSelectedRecipePath] = useState<string | null>(null);
  const [savedRecipeFingerprint, setSavedRecipeFingerprint] = useState<string>("");
  const [draggingProcessId, setDraggingProcessId] = useState<string | null>(null);
  const [dragOverProcessId, setDragOverProcessId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    tone?: "default" | "danger";
    onConfirm?: () => void;
  }>({
    open: false,
    title: "",
    message: "",
  });
  const [inputState, setInputState] = useState<{
    open: boolean;
    title: string;
    message: string;
    value: string;
    confirmLabel?: string;
    onConfirm?: (value: string) => void;
  }>({
    open: false,
    title: "",
    message: "",
    value: "",
  });

  const [state, dispatch] = useReducer(recipeMasterReducer, initialRecipeMasterState);
  const openConfirm = useCallback(
    (opts: {
      title: string;
      message: string;
      confirmLabel?: string;
      tone?: "default" | "danger";
      onConfirm: () => void;
    }) => {
      setConfirmState({
        open: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel,
        tone: opts.tone ?? "default",
        onConfirm: opts.onConfirm,
      });
    },
    []
  );

  const openInput = useCallback(
    (opts: {
      title: string;
      message: string;
      defaultValue?: string;
      confirmLabel?: string;
      onConfirm: (value: string) => void;
    }) => {
      setInputState({
        open: true,
        title: opts.title,
        message: opts.message,
        value: opts.defaultValue ?? "",
        confirmLabel: opts.confirmLabel,
        onConfirm: opts.onConfirm,
      });
    },
    []
  );

  const draft = state.draft;
  const selectedProcess = draft?.processes.find((p) => p.id === state.selectedProcessId);
  const currentRecipeFingerprint = useMemo(() => recipeFingerprint(draft), [draft]);
  const hasUnsavedRecipeChanges = useMemo(() => {
    if (mode !== "recipe" || !draft) return false;
    return currentRecipeFingerprint !== savedRecipeFingerprint;
  }, [mode, draft, currentRecipeFingerprint, savedRecipeFingerprint]);

  const refreshBaseData = useCallback(async () => {
    setLoading(true);
    try {
      const [groupRows, catalogRows] = await Promise.all([
        listCapaProcessGroups(),
        listCapaRecipeCatalog(),
      ]);
      setGroups(groupRows);
      setCatalog(catalogRows);

      setSelectedGroupId((prev) => (prev || groupRows[0]?.id ? prev ?? groupRows[0]!.id : null));
      setProcessDraft((prev) => {
        if (prev || groupRows.length === 0) return prev;
        return {
          id: groupRows[0]!.id,
          name: groupRows[0]!.name,
          sortOrder: groupRows[0]!.sortOrder,
          createdByName: groupRows[0]!.createdByName,
          createdAt: groupRows[0]!.createdAt,
        };
      });
      setRecipeFilterGroup((prev) => prev || groupRows[0]?.name || "SMT");
    } catch (e) {
      dispatch({
        type: "TRANSFER_ERROR",
        message: e instanceof Error ? e.message : "목록 조회 실패",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage) return;
    void refreshBaseData();
  }, [canManage, refreshBaseData]);

  const filteredRecipes = useMemo(
    () => catalog.filter((row) => row.processGroup === recipeFilterGroup),
    [catalog, recipeFilterGroup],
  );

  useEffect(() => {
    if (!selectedGroupId) return;
    const g = groups.find((row) => row.id === selectedGroupId);
    if (!g) return;
    setProcessDraft({
      id: g.id,
      name: g.name,
      sortOrder: g.sortOrder,
      createdByName: g.createdByName,
      createdAt: g.createdAt,
    });
  }, [selectedGroupId, groups]);

  const handleSelectRecipe = useCallback(async (storagePath: string) => {
    setSelectedRecipePath(storagePath);
    dispatch({ type: "TRANSFER_START", mode: "loading" });
    try {
      const recipe = await loadCapaRecipeWithWidgetSync(storagePath);
      dispatch({ type: "LOAD_RECIPE", recipe });
      setSavedRecipeFingerprint(recipeFingerprint(recipe));
    } catch (e) {
      dispatch({
        type: "TRANSFER_ERROR",
        message: e instanceof Error ? e.message : "모델 불러오기 실패",
      });
    } finally {
      setSelectedRecipePath(null);
    }
  }, []);

  const handleCreateNew = useCallback(async () => {
    if (mode === "process") {
      openInput({
        title: "신규 공정 추가",
        message: "추가할 공정명을 입력하세요.",
        confirmLabel: "추가",
        onConfirm: (value) => {
          const name = value.trim();
          if (!name) return;
          void (async () => {
            try {
              await createCapaProcessGroup(name);
              await refreshBaseData();
            } catch (e) {
              dispatch({
                type: "TRANSFER_ERROR",
                message: e instanceof Error ? e.message : "공정 추가 실패",
              });
            }
          })();
        },
      });
      return;
    }

      const recipe = createEmptyCapaRecipe("새 모델");
    recipe.meta.processGroup = recipeFilterGroup || "SMT";
    dispatch({ type: "LOAD_RECIPE", recipe });
    setSavedRecipeFingerprint(recipeFingerprint(recipe));
  }, [mode, recipeFilterGroup, refreshBaseData, openInput]);

  const handleSaveProcess = useCallback(async () => {
    if (!processDraft) return;
    openConfirm({
      title: "공정 저장",
      message: `공정 '${processDraft.name}' 변경사항을 저장할까요?`,
      confirmLabel: "저장",
      onConfirm: () => {
        void (async () => {
          setSavingProcess(true);
          try {
            await updateCapaProcessGroup({
              id: processDraft.id,
              name: processDraft.name,
              sortOrder: processDraft.sortOrder,
            });
            await refreshBaseData();
          } catch (e) {
            dispatch({
              type: "TRANSFER_ERROR",
              message: e instanceof Error ? e.message : "공정 저장 실패",
            });
          } finally {
            setSavingProcess(false);
          }
        })();
      },
    });
  }, [processDraft, refreshBaseData, openConfirm]);

  const handleDeleteProcess = useCallback(async () => {
    if (!processDraft) return;
    const recipeCount = catalog.filter(
      (row) => row.processGroup === processDraft.name
    ).length;
    openConfirm({
      title: "공정 삭제",
      message: `공정 '${processDraft.name}'을 삭제할까요?\n해당 공정의 모델 ${recipeCount}개도 함께 삭제됩니다.`,
      confirmLabel: "삭제",
      tone: "danger",
      onConfirm: () => {
        void (async () => {
          try {
            await deleteCapaProcessGroup(processDraft.id);
            setProcessDraft(null);
            setSelectedGroupId(null);
            await refreshBaseData();
          } catch (e) {
            dispatch({
              type: "TRANSFER_ERROR",
              message: e instanceof Error ? e.message : "공정 삭제 실패",
            });
          }
        })();
      },
    });
  }, [processDraft, catalog, refreshBaseData, openConfirm]);

  const handleSaveRecipe = useCallback(async () => {
    if (!draft) return;
    openConfirm({
      title: "모델 저장",
      message: `모델 '${draft.meta.name}' 변경사항을 저장할까요?`,
      confirmLabel: "저장",
      onConfirm: () => {
        void (async () => {
          dispatch({ type: "TRANSFER_START", mode: "saving" });
          try {
            const recipeToSave: CapaRecipe = {
              ...draft,
              meta: {
                ...draft.meta,
                processGroup: draft.meta.processGroup?.trim() || recipeFilterGroup || "SMT",
              },
            };
            await saveCapaRecipeToLocal(recipeToSave);
            dispatch({ type: "TRANSFER_DONE" });
            setSavedRecipeFingerprint(recipeFingerprint(recipeToSave));
            await refreshBaseData();
          } catch (e) {
            dispatch({
              type: "TRANSFER_ERROR",
              message: e instanceof Error ? e.message : "저장 실패",
            });
          }
        })();
      },
    });
  }, [draft, recipeFilterGroup, refreshBaseData, openConfirm]);

  const handleDeleteRecipe = useCallback(async () => {
    if (!draft?.meta.id) return;
    const target = catalog.find((row) => row.recipeId === draft.meta.id);
    if (!target) {
      openConfirm({
        title: "삭제 불가",
        message: "삭제할 모델이 카탈로그에 없습니다.",
        confirmLabel: "확인",
        onConfirm: () => {},
      });
      return;
    }
    openConfirm({
      title: "모델 삭제",
      message: `모델 '${target.name}'을 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger",
      onConfirm: () => {
        void (async () => {
          try {
            await deleteCapaRecipeCatalogItem({
              recipeId: target.recipeId,
              storagePath: target.storagePath,
            });
            const emptyRecipe = createEmptyCapaRecipe("새 모델");
            dispatch({ type: "LOAD_RECIPE", recipe: emptyRecipe });
            setSavedRecipeFingerprint(recipeFingerprint(emptyRecipe));
            await refreshBaseData();
          } catch (e) {
            dispatch({
              type: "TRANSFER_ERROR",
              message: e instanceof Error ? e.message : "모델 삭제 실패",
            });
          }
        })();
      },
    });
  }, [draft?.meta.id, catalog, refreshBaseData, openConfirm]);

  const handleReorderProcessGroups = useCallback(
    async (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;

      const sourceIndex = groups.findIndex((g) => g.id === sourceId);
      const targetIndex = groups.findIndex((g) => g.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return;

      const nextGroups = [...groups];
      const [moved] = nextGroups.splice(sourceIndex, 1);
      if (!moved) return;
      nextGroups.splice(targetIndex, 0, moved);

      const normalizedGroups = nextGroups.map((group, idx) => ({
        ...group,
        sortOrder: idx + 1,
      }));
      setGroups(normalizedGroups);

      const selected = normalizedGroups.find((g) => g.id === selectedGroupId);
      if (selected) {
        setProcessDraft((prev) =>
          prev && prev.id === selected.id ? { ...prev, sortOrder: selected.sortOrder } : prev
        );
      }

      setReorderingProcess(true);
      try {
        await Promise.all(
          normalizedGroups.map((group) =>
            updateCapaProcessGroup({
              id: group.id,
              name: group.name,
              sortOrder: group.sortOrder,
            })
          )
        );
      } catch (e) {
        dispatch({
          type: "TRANSFER_ERROR",
          message: e instanceof Error ? e.message : "공정 순서 변경 실패",
        });
        await refreshBaseData();
      } finally {
        setReorderingProcess(false);
      }
    },
    [groups, selectedGroupId, refreshBaseData]
  );

  const requestSelectRecipe = useCallback(
    (storagePath: string) => {
      if (!hasUnsavedRecipeChanges) {
        void handleSelectRecipe(storagePath);
        return;
      }
      openConfirm({
        title: "변경사항 확인",
        message: "저장하지 않은 변경사항이 있습니다.\n이동하면 입력한 내용이 취소됩니다. 이동할까요?",
        confirmLabel: "이동",
        tone: "danger",
        onConfirm: () => {
          void handleSelectRecipe(storagePath);
        },
      });
    },
    [hasUnsavedRecipeChanges, handleSelectRecipe, openConfirm]
  );

  const handleReorderProcesses = useCallback(
    (sourceId: string, targetId: string) => {
      if (!draft || sourceId === targetId) return;
      const currentIds = draft.processes.map((p) => p.id);
      const sourceIndex = currentIds.indexOf(sourceId);
      const targetIndex = currentIds.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return;

      const nextIds = [...currentIds];
      const [movedId] = nextIds.splice(sourceIndex, 1);
      if (!movedId) return;
      nextIds.splice(targetIndex, 0, movedId);
      dispatch({ type: "REORDER_PROCESSES", processIds: nextIds });
    },
    [draft]
  );

  useEffect(() => {
    if (!hasUnsavedRecipeChanges) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      const isSamePage =
        nextUrl.origin === currentUrl.origin &&
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search &&
        nextUrl.hash === currentUrl.hash;
      if (isSamePage) return;

      event.preventDefault();
      event.stopPropagation();
      openConfirm({
        title: "변경사항 확인",
        message: "저장하지 않은 변경사항이 있습니다.\n이동하면 입력한 내용이 취소됩니다. 이동할까요?",
        confirmLabel: "이동",
        tone: "danger",
        onConfirm: () => {
          window.location.assign(nextUrl.toString());
        },
      });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [hasUnsavedRecipeChanges, openConfirm]);

  if (!canManage) {
    return (
      <CapaPageShell title={pageTitle} description="그룹장·팀장 권한이 필요합니다.">
        <p className="text-sm text-slate-600">접근 권한이 없습니다.</p>
      </CapaPageShell>
    );
  }

  return (
    <CapaPageShell title={pageTitle}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/40 lg:w-[420px]">
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("process")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                mode === "process"
                  ? "bg-sky-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              공정 관리
            </button>
            <button
              type="button"
              onClick={() => setMode("recipe")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                mode === "recipe"
                  ? "bg-sky-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              모델 관리
            </button>
            <button
              type="button"
              onClick={() => void handleCreateNew()}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-dashed border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 hover:bg-sky-100"
            >
              <Plus className="h-4 w-4" />
              {mode === "process" ? "신규 공정 추가" : "신규 모델 추가"}
            </button>
          </div>

          {mode === "recipe" ? (
            <label className="mb-3 block">
              <span className="text-xs font-semibold uppercase text-slate-500">
                공정 선택
              </span>
              <select
                className={`mt-1 ${capaInputClassFull}`}
                value={recipeFilterGroup}
                onChange={(e) => setRecipeFilterGroup(e.target.value)}
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.name}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
              목록 불러오는 중…
            </div>
          ) : mode === "process" ? (
            <ul className="space-y-1.5">
              {groups.map((group) => (
                <li
                  key={group.id}
                  draggable
                  onDragStart={() => {
                    setDraggingGroupId(group.id);
                    setDragOverGroupId(group.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dragOverGroupId !== group.id) {
                      setDragOverGroupId(group.id);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggingGroupId) return;
                    void handleReorderProcessGroups(draggingGroupId, group.id);
                    setDraggingGroupId(null);
                    setDragOverGroupId(null);
                  }}
                  onDragEnd={() => {
                    setDraggingGroupId(null);
                    setDragOverGroupId(null);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`w-full cursor-grab rounded-lg px-3 py-2 text-left text-sm active:cursor-grabbing ${
                      selectedGroupId === group.id
                        ? "bg-sky-50 text-sky-900 ring-1 ring-sky-300"
                        : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    } ${
                      dragOverGroupId === group.id && draggingGroupId !== group.id
                        ? "ring-2 ring-sky-300"
                        : ""
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>{group.name}</span>
                      <GripVertical className="h-3.5 w-3.5 text-slate-400" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-1.5">
              {filteredRecipes.map((item) => (
                <li key={item.storagePath}>
                  <button
                    type="button"
                    onClick={() => requestSelectRecipe(item.storagePath)}
                    disabled={selectedRecipePath === item.storagePath}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      draft?.meta.id === item.recipeId
                        ? "bg-sky-50 text-sky-900 ring-1 ring-sky-300"
                        : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    } disabled:opacity-60`}
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="min-w-0 flex-1 rounded-2xl border border-sky-200 bg-white p-3 shadow-sm shadow-sky-100/40">
          {mode === "process" ? (
            processDraft ? (
              <div className="space-y-4">
                <div className="flex items-center justify-end gap-2">
                  {reorderingProcess ? (
                    <span className="mr-auto inline-flex items-center gap-1 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      순서 저장 중...
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleDeleteProcess()}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveProcess()}
                    disabled={savingProcess}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                  >
                    {savingProcess ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    저장
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-1">
                  <label>
                    <span className="text-xs font-medium text-slate-600">공정명</span>
                    <input
                      className={`mt-1 ${capaInputClassFull}`}
                      value={processDraft.name}
                      onChange={(e) =>
                        setProcessDraft((prev) =>
                          prev ? { ...prev, name: e.target.value } : prev
                        )
                      }
                    />
                  </label>
                </div>
                <p className="text-sm text-slate-500">
                  작성자 {processDraft.createdByName ?? "-"} · 작성일{" "}
                  {formatDate(processDraft.createdAt)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">좌측에서 공정을 선택해 주세요.</p>
            )
          ) : draft ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="w-[10rem]">
                    <span className="text-xs font-medium text-slate-600">소속 공정</span>
                    <select
                      className={`mt-1 h-10 ${capaInputClassFull}`}
                      value={draft.meta.processGroup ?? recipeFilterGroup}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_META",
                          patch: { processGroup: e.target.value },
                        })
                      }
                    >
                      {groups.map((group) => (
                        <option key={group.id} value={group.name}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="w-[14rem]">
                  <span className="text-xs font-medium text-slate-600">모델명</span>
                  <input
                    className={`mt-1 h-10 ${capaInputClassFull}`}
                    value={draft.meta.name}
                    onChange={(e) =>
                      dispatch({ type: "UPDATE_META", patch: { name: e.target.value } })
                    }
                  />
                  </label>
                  <label className="w-[7rem]">
                    <span className="text-xs font-medium text-slate-600">배열</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className={`h-10 ${capaMetricInputClass}`}
                      value={resolveArrayMultiplier(draft.meta)}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_META",
                          patch: { arrayMultiplier: normalizeArrayMultiplier(e.target.value) },
                        })
                      }
                    />
                  </label>
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDeleteRecipe()}
                    className="inline-flex h-10 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveRecipe()}
                    disabled={state.transferStatus === "saving"}
                    className="inline-flex h-10 items-center gap-1 rounded-md bg-sky-600 px-2.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                  >
                    {state.transferStatus === "saving" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    저장
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">설비 목록</p>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: "ADD_PROCESS",
                        process: createDefaultProcess(draft.processes.length + 1),
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-white px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    공정 추가
                  </button>
                </div>
                <div className="mb-1 grid grid-cols-[minmax(220px,1fr)_228px_120px_120px_52px] items-center gap-4 px-1 text-[11px] font-semibold text-slate-500">
                  <span className="text-center">설비명</span>
                  <span className="text-center">C/T · UPH</span>
                  <span className="text-center">가동률(%)</span>
                  <span className="text-center">설비대수</span>
                  <span className="text-center">삭제</span>
                </div>
                <ul className="space-y-1">
                  {draft.processes.map((p) => (
                    <li
                      key={p.id}
                      draggable
                      onDragStart={() => {
                        setDraggingProcessId(p.id);
                        setDragOverProcessId(p.id);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (dragOverProcessId !== p.id) {
                          setDragOverProcessId(p.id);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!draggingProcessId) return;
                        handleReorderProcesses(draggingProcessId, p.id);
                        setDraggingProcessId(null);
                        setDragOverProcessId(null);
                      }}
                      onDragEnd={() => {
                        setDraggingProcessId(null);
                        setDragOverProcessId(null);
                      }}
                      className={`rounded-lg bg-white px-2 py-2 ${
                        dragOverProcessId === p.id && draggingProcessId !== p.id
                          ? "ring-2 ring-sky-300"
                          : ""
                      }`}
                    >
                      <div className="grid grid-cols-[minmax(220px,1fr)_228px_120px_120px_52px] items-center gap-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-400 active:cursor-grabbing" />
                          <input
                            className={`h-10 w-full ${capaInputClass}`}
                            value={p.processName}
                            onChange={(e) =>
                              dispatch({
                                type: "UPDATE_PROCESS",
                                processId: p.id,
                                patch: { processName: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div className="w-full">
                          <ProcessThroughputInput
                            layout="inline"
                            inlineInputWidthClass="w-[110px]"
                            ctSec={p.ctSec}
                            arrayMultiplier={resolveArrayMultiplier(draft.meta)}
                            mode={throughputMode}
                            onModeChange={setThroughputMode}
                            onCtSecChange={(ctSec) =>
                              dispatch({
                                type: "UPDATE_PROCESS",
                                processId: p.id,
                                patch: { ctSec },
                              })
                            }
                          />
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          className={`h-10 w-full ${capaInputClass}`}
                          value={Math.round((p.defaultUptimeRate ?? 0.9) * 100)}
                          onChange={(e) => {
                            const rate = Math.min(
                              100,
                              Math.max(1, Math.round(Number(e.target.value) || 90))
                            );
                            dispatch({
                              type: "UPDATE_PROCESS",
                              processId: p.id,
                              patch: { defaultUptimeRate: rate / 100 },
                            });
                          }}
                        />
                        <input
                          type="number"
                          min={1}
                          className={`h-10 w-full ${capaInputClass}`}
                          value={p.equipmentCount}
                          onChange={(e) =>
                            dispatch({
                              type: "UPDATE_PROCESS",
                              processId: p.id,
                              patch: {
                                equipmentCount:
                                  Math.max(1, Math.floor(Number(e.target.value))) || 1,
                              },
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            openConfirm({
                              title: "설비 삭제",
                              message: `설비 '${p.processName || "-"}'을 삭제할까요?`,
                              confirmLabel: "삭제",
                              tone: "danger",
                              onConfirm: () =>
                                dispatch({ type: "REMOVE_PROCESS", processId: p.id }),
                            })
                          }
                          className="inline-flex h-10 w-[52px] items-center justify-center rounded-md border border-red-200 bg-red-50 px-2 text-xs text-red-700 hover:bg-red-100"
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">좌측에서 모델을 선택해 주세요.</p>
          )}
        </section>
      </div>

      {state.transferMessage ? (
        <p className="mt-4 text-sm text-red-600">{state.transferMessage}</p>
      ) : null}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        tone={confirmState.tone}
        onClose={() => setConfirmState((prev) => ({ ...prev, open: false }))}
        onConfirm={() => {
          const fn = confirmState.onConfirm;
          setConfirmState((prev) => ({ ...prev, open: false }));
          fn?.();
        }}
      />
      <InputDialog
        open={inputState.open}
        title={inputState.title}
        message={inputState.message}
        value={inputState.value}
        confirmLabel={inputState.confirmLabel}
        onChange={(value) => setInputState((prev) => ({ ...prev, value }))}
        onClose={() => setInputState((prev) => ({ ...prev, open: false }))}
        onConfirm={() => {
          const fn = inputState.onConfirm;
          const value = inputState.value;
          setInputState((prev) => ({ ...prev, open: false, value: "" }));
          fn?.(value);
        }}
      />
    </CapaPageShell>
  );
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "확인",
  tone = "default",
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="whitespace-pre-line text-sm text-slate-700">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              tone === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function InputDialog({
  open,
  title,
  message,
  value,
  confirmLabel = "확인",
  onChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  value: string;
  confirmLabel?: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-700">{message}</p>
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
            }}
            className={`w-full ${capaInputClassFull}`}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
