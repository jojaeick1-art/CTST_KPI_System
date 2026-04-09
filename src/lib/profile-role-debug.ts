import type { ProfileRole } from "@/src/types/profile";

/** 개발 모드에서 F12로 DB 원문 role과 UI용 정규화 role을 비교합니다. */
export function logProfileRoleSync(payload: {
  phase: string;
  authUid: string;
  profileRowId: string;
  dbRoleRaw: string | null | undefined;
  normalizedRoleForUi: ProfileRole;
}): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "development") return;
  console.info("[CTST profile]", payload.phase, {
    authUid: payload.authUid,
    profileRowId: payload.profileRowId,
    dbRoleRaw: payload.dbRoleRaw ?? null,
    uiRoleAssigned: payload.normalizedRoleForUi,
    idMatchesAuth: payload.authUid === payload.profileRowId,
  });
}
