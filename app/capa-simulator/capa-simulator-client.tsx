"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  GitCompare,
  Lock,
  Loader2,
  Plus,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { CtstPortalShell } from "@/src/components/ctst-portal-shell";
import { useCapaSimulatorAvailability, useDashboardProfile } from "@/src/hooks/useKpiQueries";
import { useCapaModels, useCapaRecipe, CAPA_MODELS_QUERY_KEY } from "@/src/hooks/useCapaSimulatorQueries";
import { canManageCapaRecipe, isAdminRole } from "@/src/lib/rbac";
import { createBrowserSupabase } from "@/src/lib/supabase";
import {
  bottleneckCtSecFromEquipments,
  computeProcessSimulation,
  lineBottleneckCapacity,
  trafficLightFromLoad,
  type TrafficLight,
} from "@/src/lib/capa-sim-engine";
import type { ShiftPreset, SimProcessWithEquipments } from "@/src/types/capa";

export type LineSimBlock = {
  lineCap: number;
  lineLoad: number | null;
  lineLight: TrafficLight;
  rows: {
    processId: string;
    processName: string;
    seqNo: number;
    bottleneckCtSec: number;
    uptimeRate: number;
    availableTimeSec: number;
    capacityUnits: number;
    uph: number;
    loadRate: number | null;
  }[];
};

function trafficColor(t: TrafficLight): string {
  if (t === "green") return "bg-emerald-500";
  if (t === "yellow") return "bg-amber-400";
  return "bg-red-500";
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

type ColumnKey = "a" | "b";

export function CapaSimulatorClient() {
  const queryClient = useQueryClient();
  const profileQ = useDashboardProfile();
  const capaAvailabilityQ = useCapaSimulatorAvailability(
    profileQ.isSuccess && profileQ.data !== null
  );
  const modelsQ = useCapaModels(
    profileQ.isSuccess && profileQ.data !== null
  );
  const [modelIdA, setModelIdA] = useState<string>("");
  const [modelIdB, setModelIdB] = useState<string>("");
  const [compare, setCompare] = useState(false);
  const [selectedA, setSelectedA] = useState<Set<string>>(new Set());
  const [selectedB, setSelectedB] = useState<Set<string>>(new Set());
  const [shift, setShift] = useState<ShiftPreset>("8h");
  const [workDays, setWorkDays] = useState(5);
  const [demand, setDemand] = useState<string>("");
  const [openAcc, setOpenAcc] = useState<Set<string>>(new Set());
  const [newEq, setNewEq] = useState<Record<string, { name: string; ct: string; up: string }>>(
    {}
  );

  const recipeA = useCapaRecipe(modelIdA || undefined);
  const recipeB = useCapaRecipe(compare && modelIdB ? modelIdB : undefined);

  const canEdit = canManageCapaRecipe(profileQ.data?.profile.role);
  const isAdmin = isAdminRole(profileQ.data?.profile.role);
  const capaEnabled = capaAvailabilityQ.data ?? false;
  const canAccessCapa = isAdmin || capaEnabled;

  const demandNum = useMemo(() => {
    const t = demand.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [demand]);

  useEffect(() => {
    if (!modelIdA || !recipeA.data?.length) return;
    setSelectedA((prev) => {
      if (prev.size > 0) return prev;
      return new Set(recipeA.data!.map((p) => p.id));
    });
  }, [modelIdA, recipeA.data]);

  useEffect(() => {
    if (!compare || !modelIdB || !recipeB.data?.length) return;
    setSelectedB((prev) => {
      if (prev.size > 0) return prev;
      return new Set(recipeB.data!.map((p) => p.id));
    });
  }, [compare, modelIdB, recipeB.data]);

  const runColumn = useCallback(
    (
      processes: SimProcessWithEquipments[] | undefined,
      selected: Set<string>
    ): LineSimBlock => {
      if (!processes?.length) {
        return {
          rows: [],
          lineCap: 0,
          lineLoad: null,
          lineLight: "green",
        };
      }
      const ordered = [...processes]
        .filter((p) => selected.has(p.id))
        .sort((a, b) => a.seq_no - b.seq_no);
      const rows = ordered.map((p) => {
        const cts = p.equipments.map((e) => Number(e.ct_sec));
        const bt = bottleneckCtSecFromEquipments(cts) ?? 1;
        const uptimes = p.equipments.map((e) => Number(e.std_uptime_rate));
        const u = uptimes.length
          ? Math.min(...uptimes)
          : 0.9;
        const base = computeProcessSimulation({
          bottleneckCtSec: bt,
          uptimeRate: u,
          shiftPreset: shift,
          workDays,
          demand: demandNum,
        });
        return {
          processId: p.id,
          processName: p.process_name,
          seqNo: p.seq_no,
          ...base,
        };
      });
      const caps = rows.map((r) => r.capacityUnits);
      const lineCap = lineBottleneckCapacity(caps);
      const lineLoad =
        demandNum != null && demandNum > 0 && lineCap > 0
          ? demandNum / lineCap
          : null;
      return {
        rows,
        lineCap,
        lineLoad,
        lineLight: trafficLightFromLoad(lineLoad),
      };
  },
  [shift, workDays, demandNum]
  );

  const resultA = useMemo(
    () => runColumn(recipeA.data, selectedA),
    [runColumn, recipeA.data, selectedA]
  );
  const resultB = useMemo(
    () => runColumn(recipeB.data, selectedB),
    [runColumn, recipeB.data, selectedB]
  );

  const primaryLine = compare ? null : resultA;
  const periodEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + Math.max(1, Math.ceil(workDays)));
    return d;
  }, [workDays]);

  async function handleAddEquipment(processId: string, modelIdForInvalidate: string) {
    const draft = newEq[processId];
    if (!draft?.name?.trim() || !draft.ct) return;
    const ct = Number(draft.ct);
    const up = draft.up ? Number(draft.up) : 0.92;
    if (!(ct > 0) || !(up > 0 && up <= 1)) {
      window.alert("C/T(초)·가동률(0~1)을 확인해 주세요.");
      return;
    }
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from("sim_equipments").insert({
      process_id: processId,
      equipment_name: draft.name.trim(),
      ct_sec: ct,
      std_uptime_rate: up,
      sort_order: 99,
      is_active: true,
    });
    if (error) {
      window.alert(error.message);
      return;
    }
    setNewEq((prev) => ({ ...prev, [processId]: { name: "", ct: "", up: "" } }));
    await queryClient.invalidateQueries({
      queryKey: ["supabase", "capa", "recipe", modelIdForInvalidate],
    });
  }

  function toggleSel(
    col: ColumnKey,
    id: string,
    checked: boolean
  ) {
    if (col === "a") {
      setSelectedA((prev) => {
        const n = new Set(prev);
        if (checked) n.add(id);
        else n.delete(id);
        return n;
      });
    } else {
      setSelectedB((prev) => {
        const n = new Set(prev);
        if (checked) n.add(id);
        else n.delete(id);
        return n;
      });
    }
  }

  if (profileQ.isPending || capaAvailabilityQ.isPending) {
    return (
      <CtstPortalShell>
        <div className="flex min-h-full items-center justify-center px-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
        </div>
      </CtstPortalShell>
    );
  }

  if (!canAccessCapa) {
    return (
      <CtstPortalShell>
        <div className="flex min-h-full flex-col items-center justify-center px-4 py-16">
          <div className="w-full max-w-md rounded-2xl border border-sky-200 bg-white p-8 text-center shadow-lg shadow-sky-100/50">
            <img
              src="/c-one%20logo.png?v=4"
              alt="C-ONE 로고"
              className="mx-auto h-auto max-h-[72px] w-auto max-w-[min(100%,240px)] object-contain"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700/90">
              CTST 통합 시스템
            </p>
            <h1 className="mt-2 text-xl font-bold text-slate-800">CAPA Simulator</h1>
            <p className="mt-3 text-sm text-slate-600">서비스 준비 중입니다.</p>
            <p className="mt-1 text-sm text-slate-600">
              준비가 완료되면 이 경로에서 이용할 수 있습니다.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              관리자 잠금 상태
            </p>
          </div>
        </div>
      </CtstPortalShell>
    );
  }

  return (
    <CtstPortalShell>
      <div className="min-h-full border-b border-sky-200 bg-white/70 px-4 py-6 sm:px-8">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              CAPA Simulator
            </h1>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              모델·공정을 선택한 뒤 교대·근무일수를 넣으면 공정별 병목 CAPA와 라인 전체 병목을
              확인할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCompare((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
              compare
                ? "border-sky-300 bg-sky-50 text-sky-900"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <GitCompare className="h-4 w-4" aria-hidden />
            비교 모드
          </button>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]">
          <section className="space-y-6 lg:sticky lg:top-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-700">
              조건 설정
            </h2>

            <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm shadow-sky-100/40">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                모델 선택
              </label>
              {modelsQ.isPending ? (
                <Loader2 className="mt-3 h-6 w-6 animate-spin text-sky-600" />
              ) : modelsQ.isError ? (
                <p className="mt-2 text-sm text-red-600">{modelsQ.error.message}</p>
              ) : (
                <select
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none ring-sky-300 focus:ring-2"
                  value={modelIdA}
                  onChange={(e) => {
                    setModelIdA(e.target.value);
                    setSelectedA(new Set());
                  }}
                >
                  <option value="">선택…</option>
                  {(modelsQ.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.model_name} ({m.model_code})
                    </option>
                  ))}
                </select>
              )}

              {compare ? (
                <>
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    비교 모델
                  </label>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none ring-sky-300 focus:ring-2"
                    value={modelIdB}
                    onChange={(e) => {
                      setModelIdB(e.target.value);
                      setSelectedB(new Set());
                    }}
                  >
                    <option value="">선택…</option>
                    {(modelsQ.data ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.model_name} ({m.model_code})
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </div>

            <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm shadow-sky-100/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                근무 프리셋 · 기간
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShift("8h")}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${
                    shift === "8h"
                      ? "bg-sky-600 text-white shadow-md shadow-sky-500/25"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  단일 8h/일
                </button>
                <button
                  type="button"
                  onClick={() => setShift("12h")}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${
                    shift === "12h"
                      ? "bg-sky-600 text-white shadow-md shadow-sky-500/25"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  2교대 24h/일
                </button>
              </div>
              <label className="mt-4 block text-xs font-medium text-slate-600">
                근무일수 (시뮬레이션 기간)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={workDays}
                onChange={(e) => setWorkDays(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full max-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none ring-sky-300 focus:ring-2"
              />
              <label className="mt-4 block text-xs font-medium text-slate-600">
                수량 목표 (선택, 동일 기간 대비 부하율)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="예: 10000"
                value={demand}
                onChange={(e) => setDemand(e.target.value)}
                className="mt-1 w-full max-w-[240px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none ring-sky-300 focus:ring-2"
              />
            </div>

            {modelIdA && recipeA.data ? (
              <ProcessSelectList
                title="공정 선택 (A)"
                processes={recipeA.data}
                selected={selectedA}
                onToggle={(id, c) => toggleSel("a", id, c)}
                openAcc={openAcc}
                setOpenAcc={setOpenAcc}
                canEdit={canEdit}
                modelId={modelIdA}
                newEq={newEq}
                setNewEq={setNewEq}
                onAddEquipment={handleAddEquipment}
              />
            ) : null}

            {compare && modelIdB && recipeB.data ? (
              <ProcessSelectList
                title="공정 선택 (B)"
                processes={recipeB.data}
                selected={selectedB}
                onToggle={(id, c) => toggleSel("b", id, c)}
                openAcc={openAcc}
                setOpenAcc={setOpenAcc}
                canEdit={canEdit}
                modelId={modelIdB}
                newEq={newEq}
                setNewEq={setNewEq}
                onAddEquipment={handleAddEquipment}
              />
            ) : null}
          </section>

          <section className="min-w-0 space-y-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-700">
              결과
            </h2>

            {!compare && primaryLine ? (
              <SummaryCard
                lineCap={primaryLine.lineCap}
                lineLoad={primaryLine.lineLoad}
                lineLight={primaryLine.lineLight}
                periodEnd={periodEnd}
                demandNum={demandNum}
              />
            ) : null}

            {compare ? (
              <div className="grid gap-4 md:grid-cols-2">
                <ResultColumn label="모델 A" result={resultA} periodEnd={periodEnd} />
                <ResultColumn label="모델 B" result={resultB} periodEnd={periodEnd} />
              </div>
            ) : (
              <ProcessResultGrid rows={resultA.rows} />
            )}
          </section>
        </div>

        {!modelsQ.data?.length && modelsQ.isSuccess ? (
          <div className="mt-8 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              등록된 모델이 없습니다. Supabase에 `sim_models` 마이그레이션을 적용했는지 확인하거나
              관리자에게 문의하세요.
            </span>
          </div>
        ) : null}
      </div>
    </CtstPortalShell>
  );
}

function SummaryCard({
  lineCap,
  lineLoad,
  lineLight,
  periodEnd,
  demandNum,
}: {
  lineCap: number;
  lineLoad: number | null;
  lineLight: TrafficLight;
  periodEnd: Date;
  demandNum: number | null;
}) {
  return (
    <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 shadow-lg shadow-sky-100/50">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-block h-4 w-4 rounded-full ${trafficColor(lineLight)}`}
          title="라인 신호등"
        />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          라인 병목 CAPA (선택 공정 중 최소)
        </p>
      </div>
      <p className="mt-3 text-4xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-5xl">
        {formatInt(lineCap)}
        <span className="ml-2 text-xl font-semibold text-slate-500">units / 기간</span>
      </p>
      {demandNum != null && demandNum > 0 ? (
        <p className="mt-2 text-sm text-slate-600">
          목표 대비 부하율:{" "}
          <span className="font-semibold text-slate-800">
            {lineLoad != null ? `${(lineLoad * 100).toFixed(1)}%` : "—"}
          </span>
        </p>
      ) : null}
      <p className="mt-4 text-sm text-slate-500">
        기간 종료 가정일:{" "}
        <span className="font-medium text-slate-800">
          {periodEnd.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      </p>
    </div>
  );
}

function ResultColumn({
  label,
  result,
  periodEnd,
}: {
  label: string;
  result: LineSimBlock;
  periodEnd: Date;
}) {
  return (
    <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${trafficColor(result.lineLight)}`} />
        <span className="text-2xl font-bold tabular-nums text-slate-900">
          {formatInt(result.lineCap)}
        </span>
        <span className="text-sm text-slate-500">units / 기간</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        ~종료{" "}
        {periodEnd.toLocaleDateString("ko-KR", {
          month: "short",
          day: "numeric",
        })}
      </p>
      <ProcessResultGrid rows={result.rows} compact />
    </div>
  );
}

function ProcessResultGrid({
  rows,
  compact,
}: {
  rows: {
    processName: string;
    capacityUnits: number;
    uph: number;
    loadRate: number | null;
  }[];
  compact?: boolean;
}) {
  if (!rows.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        공정을 선택해 주세요.
      </p>
    );
  }
  return (
    <div
      className={`grid gap-3 ${compact ? "sm:grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3"}`}
    >
      {rows.map((r, i) => (
        <div
          key={`${r.processName}-${i}`}
          className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-sky-100/30"
        >
          <p className="text-sm font-semibold text-slate-800">{r.processName}</p>
          <dl className="mt-3 space-y-1 text-xs text-slate-600">
            <div className="flex justify-between gap-2">
              <dt>기간 CAPA</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {formatInt(r.capacityUnits)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>UPH (병목 기준)</dt>
              <dd className="tabular-nums text-slate-800">{r.uph.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>부하율</dt>
              <dd className="tabular-nums">
                {r.loadRate != null ? `${(r.loadRate * 100).toFixed(1)}%` : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

function ProcessSelectList({
  title,
  processes,
  selected,
  onToggle,
  openAcc,
  setOpenAcc,
  canEdit,
  modelId,
  newEq,
  setNewEq,
  onAddEquipment,
}: {
  title: string;
  processes: SimProcessWithEquipments[];
  selected: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  openAcc: Set<string>;
  setOpenAcc: React.Dispatch<React.SetStateAction<Set<string>>>;
  canEdit: boolean;
  modelId: string;
  newEq: Record<string, { name: string; ct: string; up: string }>;
  setNewEq: React.Dispatch<
    React.SetStateAction<Record<string, { name: string; ct: string; up: string }>>
  >;
  onAddEquipment: (processId: string, modelId: string) => void | Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm shadow-sky-100/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-3 space-y-2">
        {processes.map((p) => {
          const checked = selected.has(p.id);
          const open = openAcc.has(p.id);
          return (
            <li key={p.id} className="rounded-xl border border-slate-100 bg-slate-50/50">
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggle(p.id, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="flex-1 text-sm font-medium text-slate-800">
                  {p.process_name}{" "}
                  <span className="font-normal text-slate-400">({p.process_code})</span>
                </span>
                <button
                  type="button"
                  className="rounded-lg p-1 text-slate-500 hover:bg-white"
                  onClick={() =>
                    setOpenAcc((prev) => {
                      const n = new Set(prev);
                      if (n.has(p.id)) n.delete(p.id);
                      else n.add(p.id);
                      return n;
                    })
                  }
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </label>
              {open ? (
                <div className="border-t border-slate-100 bg-white px-3 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-600">
                    설비 · C/T
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-800">
                    {p.equipments.map((e) => (
                      <li
                        key={e.id}
                        className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5"
                      >
                        <span className="text-slate-900">{e.equipment_name}</span>
                        <span className="tabular-nums text-slate-700">
                          {Number(e.ct_sec).toFixed(1)}s · 가동{" "}
                          {(Number(e.std_uptime_rate) * 100).toFixed(0)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                  {canEdit ? (
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-dashed border-slate-100 pt-3">
                      <input
                        placeholder="설비명"
                        value={newEq[p.id]?.name ?? ""}
                        onChange={(e) =>
                          setNewEq((prev) => ({
                            ...prev,
                            [p.id]: {
                              name: e.target.value,
                              ct: prev[p.id]?.ct ?? "",
                              up: prev[p.id]?.up ?? "",
                            },
                          }))
                        }
                        className="min-w-[100px] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none ring-sky-300 focus:ring-2"
                      />
                      <input
                        placeholder="C/T(초)"
                        type="number"
                        value={newEq[p.id]?.ct ?? ""}
                        onChange={(e) =>
                          setNewEq((prev) => ({
                            ...prev,
                            [p.id]: {
                              name: prev[p.id]?.name ?? "",
                              ct: e.target.value,
                              up: prev[p.id]?.up ?? "",
                            },
                          }))
                        }
                        className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none ring-sky-300 focus:ring-2"
                      />
                      <input
                        placeholder="가동(0~1)"
                        type="number"
                        step={0.01}
                        value={newEq[p.id]?.up ?? ""}
                        onChange={(e) =>
                          setNewEq((prev) => ({
                            ...prev,
                            [p.id]: {
                              name: prev[p.id]?.name ?? "",
                              ct: prev[p.id]?.ct ?? "",
                              up: e.target.value,
                            },
                          }))
                        }
                        className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none ring-sky-300 focus:ring-2"
                      />
                      <button
                        type="button"
                        onClick={() => void onAddEquipment(p.id, modelId)}
                        className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        추가
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
