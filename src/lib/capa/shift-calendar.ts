import {
  DEFAULT_SHIFT_SELECTION,
  getShiftSlot,
  type CalendarDayBreakdown,
  type DayKind,
  type ShiftSelection,
  type ShiftSlotId,
  type SimulationCalendar,
} from "@/src/types/capa-shift";

const DEFAULT_WEEKEND_DAYS: (0 | 1 | 2 | 3 | 4 | 5 | 6)[] = [0, 6];

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function dayKindForDate(
  date: Date,
  weekendDays: (0 | 1 | 2 | 3 | 4 | 5 | 6)[] = DEFAULT_WEEKEND_DAYS
): DayKind {
  return weekendDays.includes(date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6)
    ? "weekend"
    : "weekday";
}

export function activeShiftsForDay(
  dayKind: DayKind,
  selection: ShiftSelection = DEFAULT_SHIFT_SELECTION
): ShiftSlotId[] {
  const ids = dayKind === "weekday" ? selection.weekday : selection.weekend;
  return ids.filter((id) => getShiftSlot(id)?.dayKind === dayKind);
}

export function nominalMinutesForShifts(slotIds: ShiftSlotId[]): number {
  let total = 0;
  for (const id of slotIds) {
    const slot = getShiftSlot(id);
    if (slot) total += slot.durationMinutes;
  }
  return total;
}

/** 달력 범위(포함) 일별 breakdown */
export function buildCalendarDays(
  calendar: SimulationCalendar,
  selection: ShiftSelection = DEFAULT_SHIFT_SELECTION
): CalendarDayBreakdown[] {
  const weekendDays = calendar.weekendDays ?? DEFAULT_WEEKEND_DAYS;
  const start = parseYmd(calendar.startDate);
  const end = parseYmd(calendar.endDate);
  if (end < start) return [];

  const days: CalendarDayBreakdown[] = [];
  for (let cur = new Date(start); cur <= end; cur = addDays(cur, 1)) {
    const kind = dayKindForDate(cur, weekendDays);
    const activeShifts = activeShiftsForDay(kind, selection);
    days.push({
      date: formatYmd(cur),
      dayKind: kind,
      activeShifts,
      nominalMinutes: nominalMinutesForShifts(activeShifts),
    });
  }
  return days;
}

export function countCalendarDays(calendar: SimulationCalendar): number {
  return buildCalendarDays(calendar).length;
}

export function totalNominalMinutesInCalendar(
  calendar: SimulationCalendar,
  selection: ShiftSelection = DEFAULT_SHIFT_SELECTION
): number {
  return buildCalendarDays(calendar, selection).reduce(
    (sum, d) => sum + d.nominalMinutes,
    0
  );
}

export function todayYmd(): string {
  return formatYmd(new Date());
}

/** 생산 시작일·기간(연속 N일)으로 시뮬레이션 달력 생성 */
export function simulationCalendar(
  periodDays: number,
  startDate: string = todayYmd()
): SimulationCalendar {
  const start = parseYmd(startDate);
  const end = addDays(start, Math.max(1, periodDays) - 1);
  return {
    startDate: formatYmd(start),
    endDate: formatYmd(end),
  };
}

/** @deprecated simulationCalendar(periodDays) 사용 */
export function defaultSimulationCalendar(workDays: number): SimulationCalendar {
  return simulationCalendar(workDays);
}

export function formatYmdKo(ymd: string): string {
  const d = parseYmd(ymd);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/** 시작일 + N일(포함) → 종료일 YMD */
export function endDateAfterDays(startDate: string, days: number): string {
  const start = parseYmd(startDate);
  return formatYmd(addDays(start, Math.max(1, days) - 1));
}

export function extendCalendarToDays(
  startDate: string,
  requiredDays: number
): SimulationCalendar {
  const start = parseYmd(startDate);
  const end = addDays(start, Math.max(1, requiredDays) - 1);
  return { startDate, endDate: formatYmd(end) };
}

export { formatYmd, parseYmd, addDays };
