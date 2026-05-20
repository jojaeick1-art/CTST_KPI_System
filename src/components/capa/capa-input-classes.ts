/** CAPA 폼 입력 — 밝은 배경 + 진한 글자 (OS 다크 모드에서도 시인성 유지) */
export const capaInputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm [color-scheme:light] placeholder:text-slate-500 caret-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100 disabled:text-slate-600";

export const capaInputClassFull = `w-full ${capaInputClass}`;

export const capaInputClassCompact =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm [color-scheme:light] placeholder:text-slate-500 caret-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100 disabled:text-slate-600";

/** 측정 기준·설비 대수·가동률 등 짧은 숫자 입력 공통 너비 (5rem) */
export const capaMetricInputWidthClass = "h-10 w-20";
export const capaMetricInputClass = `mt-1 block ${capaMetricInputWidthClass} ${capaInputClass}`;

/** CAPA 본문 래퍼 — 자식 input/select 기본 글자색 고정 */
export const capaFormSurfaceClass = "capa-form-surface [color-scheme:light]";

/** CAPA 시뮬레이터 상단 툴바 — 입력·버튼 공통 높이(40px) */
export const capaToolbarControlHeightClass = "h-10 shrink-0";

export const capaToolbarInputClass = `${capaToolbarControlHeightClass} box-border rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm [color-scheme:light] placeholder:text-slate-500 caret-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100 disabled:text-slate-600`;

export const capaToolbarPrimaryButtonClass = `inline-flex ${capaToolbarControlHeightClass} items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60`;

export const capaToolbarSecondaryButtonClass = `inline-flex ${capaToolbarControlHeightClass} items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-sky-200 bg-sky-50 px-3 text-sm text-slate-800 hover:bg-sky-100`;

export const capaToolbarRecipeNameClass = `flex ${capaToolbarControlHeightClass} min-w-[320px] max-w-[520px] flex-1 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm`;
