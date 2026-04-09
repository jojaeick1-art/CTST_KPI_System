/**
 * Supabase `profiles.role` 직급 코드.
 * 레거시: `leader` → 팀장(team_leader), `employee` → 프로(pro) 로 정규화합니다.
 */
export type ProfileRole =
  | "admin"
  | "ceo"
  | "team_leader"
  | "group_leader"
  | "principal"
  | "manager"
  | "senior"
  | "pro"
  | "leader"
  | "employee";

export type ProfileRow = {
  id: string;
  username: string;
  role: ProfileRole;
  /** 선택 컬럼: Supabase `profiles` 에 추가 시 사용 */
  full_name?: string | null;
  /** 본인 소속 부서 (선임/프로 입력권·1차 검토 범위 등에 사용) */
  dept_id?: string | null;
};
