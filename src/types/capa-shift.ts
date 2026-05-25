export type DayKind = "weekday" | "weekend";

/** 교대 슬롯 고유 ID (요일 구분 + 근무 시간) */
export type ShiftSlotId =
  | "wd-8-day"
  | "wd-8-sw"
  | "wd-8-gy"
  | "wd-12-day"
  | "wd-12-sw"
  | "we-8-day"
  | "we-8-sw"
  | "we-8-gy"
  | "we-12-day"
  | "we-12-sw";

/** 8시간 교대 식사·정지 (분) */
export const SHIFT_BREAK_MINUTES_8H = 30;
/** 12시간 교대 휴게 (분) */
export const SHIFT_BREAK_MINUTES_12H = 45;
/** 평일 8h×3 또는 주말 12h×2 풀 가동 시 일 CAPA 가용 시간 */
export const CAPA_EFFECTIVE_HOURS_PER_FULL_DAY = 22.5;

export type ShiftSlot = {
  id: ShiftSlotId;
  dayKind: DayKind;
  /** 버튼 표기 (DAY, S/W 등) */
  label: string;
  durationHours: 8 | 12;
  durationMinutes: number;
  /** 식사·휴게 등 정지 분 — CAPA 가용시간에서 차감 */
  breakMinutes: number;
};

export const SHIFT_SLOTS: readonly ShiftSlot[] = [
  {
    id: "wd-8-day",
    dayKind: "weekday",
    label: "DAY",
    durationHours: 8,
    durationMinutes: 480,
    breakMinutes: SHIFT_BREAK_MINUTES_8H,
  },
  {
    id: "wd-8-sw",
    dayKind: "weekday",
    label: "S/W",
    durationHours: 8,
    durationMinutes: 480,
    breakMinutes: SHIFT_BREAK_MINUTES_8H,
  },
  {
    id: "wd-8-gy",
    dayKind: "weekday",
    label: "G/Y",
    durationHours: 8,
    durationMinutes: 480,
    breakMinutes: SHIFT_BREAK_MINUTES_8H,
  },
  {
    id: "wd-12-day",
    dayKind: "weekday",
    label: "DAY",
    durationHours: 12,
    durationMinutes: 720,
    breakMinutes: SHIFT_BREAK_MINUTES_12H,
  },
  {
    id: "wd-12-sw",
    dayKind: "weekday",
    label: "S/W",
    durationHours: 12,
    durationMinutes: 720,
    breakMinutes: SHIFT_BREAK_MINUTES_12H,
  },
  {
    id: "we-8-day",
    dayKind: "weekend",
    label: "DAY",
    durationHours: 8,
    durationMinutes: 480,
    breakMinutes: SHIFT_BREAK_MINUTES_8H,
  },
  {
    id: "we-8-sw",
    dayKind: "weekend",
    label: "S/W",
    durationHours: 8,
    durationMinutes: 480,
    breakMinutes: SHIFT_BREAK_MINUTES_8H,
  },
  {
    id: "we-8-gy",
    dayKind: "weekend",
    label: "G/Y",
    durationHours: 8,
    durationMinutes: 480,
    breakMinutes: SHIFT_BREAK_MINUTES_8H,
  },
  {
    id: "we-12-day",
    dayKind: "weekend",
    label: "DAY",
    durationHours: 12,
    durationMinutes: 720,
    breakMinutes: SHIFT_BREAK_MINUTES_12H,
  },
  {
    id: "we-12-sw",
    dayKind: "weekend",
    label: "S/W",
    durationHours: 12,
    durationMinutes: 720,
    breakMinutes: SHIFT_BREAK_MINUTES_12H,
  },
] as const;

export type ShiftSelection = {
  weekday: ShiftSlotId[];
  weekend: ShiftSlotId[];
};

export const DEFAULT_SHIFT_SELECTION: ShiftSelection = {
  weekday: ["wd-8-day", "wd-8-sw", "wd-8-gy"],
  weekend: ["we-12-day", "we-12-sw"],
};

export function getShiftSlot(id: ShiftSlotId): ShiftSlot | undefined {
  return SHIFT_SLOTS.find((s) => s.id === id);
}

/** CAPA 산출용 가용 분 = 근무시간 − 휴게·식사 */
export function effectiveMinutesForShift(slot: ShiftSlot): number {
  return Math.max(0, slot.durationMinutes - slot.breakMinutes);
}

export function slotsForDayKind(
  dayKind: DayKind,
  durationHours?: 8 | 12
): ShiftSlot[] {
  return SHIFT_SLOTS.filter(
    (s) =>
      s.dayKind === dayKind &&
      (durationHours === undefined || s.durationHours === durationHours)
  );
}

export type SimulationCalendar = {
  startDate: string;
  endDate: string;
  weekendDays?: (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
};

export type CalendarDayBreakdown = {
  date: string;
  dayKind: DayKind;
  activeShifts: ShiftSlotId[];
  nominalMinutes: number;
};

/** @deprecated ShiftSlotId 사용 */
export type ShiftCode = ShiftSlotId;
