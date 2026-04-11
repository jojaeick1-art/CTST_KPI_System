/**
 * KPI 월 단위 축·목표 보간 (분기 라벨 대체).
 * 상·하반기 일정 텍스트(예: "6월", "10월")를 파싱해 목표 곡선을 월별로 계산합니다.
 */

export const KPI_MONTHS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
] as const;

export type MonthKey = (typeof KPI_MONTHS)[number];

export const KPI_AXIS_START = "KPI START" as const;
export type KpiAxisLabel = typeof KPI_AXIS_START | MonthKey;

/** DB·API half_type / JSON 키용 */
export function monthToHalfTypeLabel(m: MonthKey): string {
  return `M${m}`;
}

export function halfTypeLabelToMonth(ht: string | null | undefined): MonthKey | null {
  const m = String(ht ?? "")
    .trim()
    .match(/^M(\d{1,2})$/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? (n as MonthKey) : null;
}

export function formatMonthKo(m: MonthKey): string {
  return `${m}월`;
}

export function formatAxisLabel(period: KpiAxisLabel): string {
  if (period === KPI_AXIS_START) return "KPI START";
  return formatMonthKo(period);
}

/** "6월", "10 월", "10/1" 등에서 월(1~12) 추출 */
export function parseMonthFromScheduleText(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = v.match(/(\d{1,2})\s*[\/.\-월]?/);
  if (!m?.[1]) return null;
  const month = Number(m[1]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return month;
}

export type MonthSchedule = {
  h1Month: number | null;
  h2Month: number | null;
};

export function scheduleMonthsFromItemDates(
  h1TargetDate: string | null | undefined,
  h2TargetDate: string | null | undefined
): MonthSchedule {
  return {
    h1Month: parseMonthFromScheduleText(h1TargetDate ?? null),
    h2Month: parseMonthFromScheduleText(h2TargetDate ?? null),
  };
}

/**
 * 실적 입력·차트에 포함할 월(1~12). 하반기 목표월 이후는 제외(미해당).
 */
export function activeMonthsForSchedule(sched: MonthSchedule): MonthKey[] {
  const last =
    sched.h2Month ??
    sched.h1Month ??
    12;
  const cap = Math.min(12, Math.max(1, last));
  return KPI_MONTHS.filter((m) => m <= cap) as MonthKey[];
}

/**
 * 목표 %: KPI START(0) 이후 h1월까지 0→h1v, h1월~h2월까지 h1v→h2v 선형.
 * 차트에 넣지 않을 월은 null.
 */
export function monthTargetPercent(args: {
  month: MonthKey;
  h1Month: number | null;
  h2Month: number | null;
  h1Value: number;
  h2Value: number;
}): number | null {
  const { month, h1Month, h2Month, h1Value, h2Value } = args;
  const lastMonth = h2Month ?? h1Month;
  if (lastMonth !== null && month > lastMonth) return null;

  const h1m = h1Month;
  const h2m = h2Month;

  if (h1m !== null && h2m !== null) {
    if (month <= h1m) {
      if (h1m <= 0) return h1Value;
      return (h1Value * month) / h1m;
    }
    if (month <= h2m) {
      if (h2m <= h1m) return h2Value;
      return (
        h1Value + ((h2Value - h1Value) * (month - h1m)) / (h2m - h1m)
      );
    }
    return null;
  }
  if (h1m !== null && h2m === null) {
    if (month > h1m) return null;
    return (h1Value * month) / h1m;
  }
  if (h1m === null && h2m !== null) {
    if (month > h2m) return null;
    return (h2Value * month) / h2m;
  }
  return h2Value;
}

/** performance_monthly 컬럼 없을 때 저장용 레거시 분기 */
export type LegacyQuarterLabel = "26Y 1Q" | "26Y 2Q" | "26Y 3Q" | "26Y 4Q";

export function monthToLegacyQuarter(m: MonthKey): LegacyQuarterLabel {
  if (m <= 3) return "26Y 1Q";
  if (m <= 6) return "26Y 2Q";
  if (m <= 9) return "26Y 3Q";
  return "26Y 4Q";
}
