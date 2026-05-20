import { DEFAULT_SHIFT_SELECTION } from "@/src/types/capa-shift";

/** 기준 레시피 조건: 월 26일 근무 기준 */
export const ORIGINAL_RECIPE_MONTH_DAYS = 26;

/** 기준 레시피 조건: 연 26일 × 12개월 */
export const ORIGINAL_RECIPE_YEAR_DAYS = ORIGINAL_RECIPE_MONTH_DAYS * 12;

/** 평일 8h×3 · 주말 12h×2 풀 가동 */
export const ORIGINAL_RECIPE_SHIFT = DEFAULT_SHIFT_SELECTION;

export const ORIGINAL_RECIPE_CONDITION_SUMMARY =
  "월 26일 근무 · 평일 8h×3 · 주말 12h×2";
