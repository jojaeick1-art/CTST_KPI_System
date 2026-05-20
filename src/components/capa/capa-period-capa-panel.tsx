"use client";

import { useMemo } from "react";
import { computeLinePeriodCapa } from "@/src/lib/capa/period-capa";
import {
  ORIGINAL_RECIPE_CONDITION_SUMMARY,
  ORIGINAL_RECIPE_MONTH_DAYS,
  ORIGINAL_RECIPE_SHIFT,
  ORIGINAL_RECIPE_YEAR_DAYS,
} from "@/src/lib/capa/original-recipe-condition";
import type { CapaRecipe } from "@/src/types/capa-recipe";
import type { RecipeOverrideMap } from "@/src/types/capa-simulation";
import type { ShiftSelection } from "@/src/types/capa-shift";

function formatInt(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

function PeriodCapaRow({
  label,
  subtitle,
  values,
  variant,
}: {
  label: string;
  subtitle?: string;
  values: {
    daily: number;
    monthly: number;
    yearly: number;
    monthDays: number;
    yearDays: number;
  };
  variant: "baseline" | "changed";
}) {
  const yearlyBasis =
    variant === "baseline"
      ? `${values.yearDays}일 기준 (월 ${values.monthDays}일 기준)`
      : `${values.yearDays}일 기준`;

  const items = [
    { title: "일별 CAPA", value: values.daily, basis: undefined as string | undefined },
    {
      title: "월별 CAPA",
      value: values.monthly,
      basis: `${values.monthDays}일 기준`,
    },
    {
      title: "년별 CAPA",
      value: values.yearly,
      basis: yearlyBasis,
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <p
          className={`shrink-0 text-xs font-semibold uppercase tracking-wide ${
            variant === "changed" ? "text-amber-900" : "text-sky-800"
          }`}
        >
          {label}
        </p>
        {subtitle ? (
          <p className="text-xs text-slate-500 sm:text-right">{subtitle}</p>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-sky-100 bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-medium text-slate-500">{item.title}</p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">
                {formatInt(item.value)}
              </p>
              {item.basis ? (
                <p className="shrink-0 text-right text-xs text-slate-400 whitespace-nowrap">
                  {item.basis}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CapaPeriodCapaPanel({
  recipe,
  shiftConfigured,
  shiftSelection,
  workDays,
  overrides,
}: {
  recipe: CapaRecipe | null;
  shiftConfigured: boolean;
  shiftSelection: ShiftSelection;
  workDays: number;
  overrides: RecipeOverrideMap;
}) {
  const original = useMemo(() => {
    if (!recipe) return null;
    return computeLinePeriodCapa({
      recipe,
      shiftSelection: ORIGINAL_RECIPE_SHIFT,
      monthDays: ORIGINAL_RECIPE_MONTH_DAYS,
      yearDays: ORIGINAL_RECIPE_YEAR_DAYS,
    });
  }, [recipe]);

  const changed = useMemo(() => {
    if (!recipe || !shiftConfigured) return null;
    const monthDays = Math.max(1, workDays);
    return computeLinePeriodCapa({
      recipe,
      shiftSelection,
      overrides,
      monthDays,
      yearDays: monthDays * 12,
    });
  }, [recipe, shiftConfigured, shiftSelection, workDays, overrides]);

  if (!recipe) return null;

  return (
    <div className="space-y-4">
      {original ? (
        <div className="rounded-2xl border border-sky-200 bg-white px-5 py-4 shadow-sm">
          <PeriodCapaRow
            label="기준 레시피 조건"
            subtitle={ORIGINAL_RECIPE_CONDITION_SUMMARY}
            values={original}
            variant="baseline"
          />
        </div>
      ) : null}

      {shiftConfigured && changed ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 px-5 py-4 shadow-sm">
          <PeriodCapaRow
            label="시뮬레이션 조건"
            subtitle="상단 월 근무일수·근무조·목표 수량 및 하단 공정 조건 반영"
            values={changed}
            variant="changed"
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-5 shadow-sm">
          <p className="text-center text-sm text-slate-500">
            시뮬레이션 조건: 근무조를 선택해 주세요
          </p>
        </div>
      )}
    </div>
  );
}
