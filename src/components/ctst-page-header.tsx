"use client";

import { Loader2 } from "lucide-react";
import { CtstUserProfileMenu } from "@/src/components/ctst-user-profile-menu";
import {
  useAppFeatureAvailability,
  useDashboardProfile,
} from "@/src/hooks/useKpiQueries";
import { displayNameFromSession } from "@/src/lib/display-name-from-session";
import { isAdminRole, roleLabelKo } from "@/src/lib/rbac";

/** 메인 영역 스크롤 시 상단 제목·프로필 바 고정 */
export const CTST_STICKY_PAGE_HEADER_CLASS =
  "sticky top-0 z-20 shrink-0 border-b border-sky-200 bg-white/95 shadow-sm backdrop-blur-md";

export function CtstPageHeader({
  title,
  description,
  meta,
  notificationsEnabled,
}: {
  title: string;
  description?: string;
  meta?: React.ReactNode;
  notificationsEnabled?: boolean;
}) {
  const profileQ = useDashboardProfile();
  const featureQ = useAppFeatureAvailability(
    profileQ.isSuccess && profileQ.data !== null
  );

  if (profileQ.isPending) {
    return (
      <header
        className={`${CTST_STICKY_PAGE_HEADER_CLASS} flex h-[95px] items-center justify-center px-4 sm:px-8`}
      >
        <Loader2 className="h-6 w-6 animate-spin text-sky-600" aria-hidden />
      </header>
    );
  }

  const ctx = profileQ.data;
  if (!ctx) return null;

  const role = ctx.profile.role;
  const isAdmin = isAdminRole(role);
  const featureRaw = featureQ.data ?? { capa: false, voc: false, kpi: false };
  const notify =
    notificationsEnabled ??
    (isAdmin || featureRaw.kpi || featureRaw.voc || featureRaw.capa);

  const displayName = displayNameFromSession(
    ctx.profile.full_name,
    ctx.profile.username,
    ctx.session.user.user_metadata as Record<string, unknown> | undefined
  );

  return (
    <header
      className={`${CTST_STICKY_PAGE_HEADER_CLASS} h-[95px] px-4 sm:px-8`}
    >
      <div className="flex h-full items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
            {title}
          </h1>
          {description?.trim() || meta ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {description?.trim() ? <p>{description}</p> : null}
              {meta}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <CtstUserProfileMenu
            displayName={displayName}
            roleLabel={roleLabelKo(role)}
            profileUsername={ctx.profile.username}
            userId={ctx.session.user.id}
            notificationsEnabled={notify}
          />
        </div>
      </div>
    </header>
  );
}
