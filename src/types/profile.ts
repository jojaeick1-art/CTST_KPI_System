export type ProfileRole = "admin" | "leader" | "employee";

export type ProfileRow = {
  id: string;
  username: string;
  role: ProfileRole;
  /** 선택 컬럼: Supabase `profiles` 에 추가 시 사용 */
  full_name?: string | null;
};
