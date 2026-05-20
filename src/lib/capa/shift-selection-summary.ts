import {
  getShiftSlot,
  type DayKind,
  type ShiftSelection,
  type ShiftSlotId,
} from "@/src/types/capa-shift";

function summarizeSlots(ids: ShiftSlotId[], dayKind: DayKind): string {
  const slots = ids
    .map((id) => getShiftSlot(id))
    .filter((s): s is NonNullable<typeof s> => s?.dayKind === dayKind);

  if (!slots.length) return "";

  const h8 = slots.filter((s) => s.durationHours === 8).length;
  const h12 = slots.filter((s) => s.durationHours === 12).length;
  const parts: string[] = [];
  if (h8 > 0) parts.push(`8h×${h8}`);
  if (h12 > 0) parts.push(`12h×${h12}`);
  return parts.join(" ");
}

export function formatShiftSelectionSummary(
  value: ShiftSelection,
  weekdayRun: boolean,
  weekendRun: boolean
): string {
  const parts: string[] = [];

  if (weekdayRun) {
    const detail = summarizeSlots(value.weekday, "weekday");
    parts.push(detail ? `평일 ${detail}` : "평일 미선택");
  }
  if (weekendRun) {
    const detail = summarizeSlots(value.weekend, "weekend");
    parts.push(detail ? `주말 ${detail}` : "주말 미선택");
  }

  if (!parts.length) return "근무조 선택";
  return parts.join(", ");
}
