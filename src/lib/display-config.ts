/** TV 전시 슬라이드 전환 간격 (ms) */
export const DISPLAY_SLIDE_INTERVAL_MS = 5000;

/**
 * 전시 슬라이드쇼 부서 우선 순서 (이름 정규화 키).
 * DB에 있으면 이 순서를 따르고, 목록에 없던 신규 부서는 이름순으로 뒤에追加됩니다.
 */
export const DISPLAY_DEPT_PRIORITY_KEYS = [
  "기술1팀",
  "기술2팀",
  "기술팀(ramos)",
  "제조팀",
  "품질팀(qe)",
] as const;

export function normalizeDeptNameKey(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

export function orderDepartmentsForDisplay(
  departments: { id: string; name: string }[]
): { id: string; name: string }[] {
  const priorityIndex = new Map(
    DISPLAY_DEPT_PRIORITY_KEYS.map((key, index) => [key, index])
  );
  return [...departments].sort((a, b) => {
    const pa = priorityIndex.get(normalizeDeptNameKey(a.name));
    const pb = priorityIndex.get(normalizeDeptNameKey(b.name));
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return a.name.localeCompare(b.name, "ko");
  });
}
