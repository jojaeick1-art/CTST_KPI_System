"use client";

import {
  DEFAULT_SHIFT_SELECTION,
  slotsForDayKind,
  type DayKind,
  type ShiftSelection,
  type ShiftSlotId,
} from "@/src/types/capa-shift";

function SlotToggles({
  dayKind,
  durationHours,
  selected,
  onToggle,
}: {
  dayKind: DayKind;
  durationHours: 8 | 12;
  selected: ShiftSlotId[];
  onToggle: (id: ShiftSlotId, checked: boolean) => void;
}) {
  const options = slotsForDayKind(dayKind, durationHours);
  if (!options.length) return null;

  return (
    <div className="mt-2">
      <p className="mb-1 text-[10px] font-medium text-slate-500">{durationHours}시간</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <label
            key={opt.id}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
          >
            <input
              type="checkbox"
              checked={selected.includes(opt.id)}
              onChange={(e) => onToggle(opt.id, e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function ShiftSelectionPanel({
  value,
  onChange,
  weekdayRun,
  weekendRun,
  onWeekdayRunChange,
  onWeekendRunChange,
}: {
  value: ShiftSelection;
  onChange: (next: ShiftSelection) => void;
  weekdayRun: boolean;
  weekendRun: boolean;
  onWeekdayRunChange: (v: boolean) => void;
  onWeekendRunChange: (v: boolean) => void;
}) {
  function toggleIds(
    key: "weekday" | "weekend",
    id: ShiftSlotId,
    checked: boolean
  ) {
    const set = new Set(value[key]);
    if (checked) set.add(id);
    else set.delete(id);
    onChange({ ...value, [key]: [...set] });
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm shadow-sky-100/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        근무조 · 가동일
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={weekdayRun}
          onChange={(e) => onWeekdayRunChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-sky-600"
        />
        평일 가동
      </label>
      {weekdayRun ? (
        <>
          <SlotToggles
            dayKind="weekday"
            durationHours={8}
            selected={value.weekday}
            onToggle={(id, c) => toggleIds("weekday", id, c)}
          />
          <SlotToggles
            dayKind="weekday"
            durationHours={12}
            selected={value.weekday}
            onToggle={(id, c) => toggleIds("weekday", id, c)}
          />
        </>
      ) : null}

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={weekendRun}
          onChange={(e) => onWeekendRunChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-sky-600"
        />
        주말 가동
      </label>
      {weekendRun ? (
        <>
          <SlotToggles
            dayKind="weekend"
            durationHours={8}
            selected={value.weekend}
            onToggle={(id, c) => toggleIds("weekend", id, c)}
          />
          <SlotToggles
            dayKind="weekend"
            durationHours={12}
            selected={value.weekend}
            onToggle={(id, c) => toggleIds("weekend", id, c)}
          />
        </>
      ) : null}

      <button
        type="button"
        className="mt-3 text-xs text-sky-700 underline"
        onClick={() => onChange({ ...DEFAULT_SHIFT_SELECTION })}
      >
        교대 선택 초기화
      </button>
    </div>
  );
}
