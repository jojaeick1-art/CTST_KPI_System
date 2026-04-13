/**
 * 화면 표시용: 소수는 최대 소수점 둘째 자리까지(반올림), 정수는 소수 없음.
 */
export function formatKoMax2Decimals(
  value: number | string | null | undefined
): string {
  if (value === null || value === undefined) return "—";
  if (value === "") return "—";
  const n =
    typeof value === "number"
      ? value
      : Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** `formatKoMax2Decimals` 결과 뒤에 % */
export function formatKoPercentMax2(
  value: number | string | null | undefined
): string {
  if (value === null || value === undefined || value === "") return "—";
  const s = formatKoMax2Decimals(value);
  if (s === "—") return "—";
  return `${s}%`;
}

/** 계산·차트용: 숫자만 소수 둘째 자리까지 반올림 */
export function roundToMax2DecimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return n;
  return Number(n.toFixed(2));
}
