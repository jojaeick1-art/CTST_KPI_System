"use client";

import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Globe,
  LogOut,
  MessageSquareText,
  Settings,
} from "lucide-react";
import { CTST_PUBLIC_SITE_URL } from "@/src/lib/ctst-public-site";
import {
  canAccessApprovalsPage,
  canAccessSystemSettings,
  hrefDashboardDepartmentList,
} from "@/src/lib/rbac";

const itemBase =
  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-600 transition hover:bg-sky-50/80 hover:text-slate-900";
const itemActive =
  "flex items-center gap-2.5 rounded-lg bg-sky-50 px-3 py-2.5 text-sm font-medium text-sky-800 ring-1 ring-sky-100";

function NavSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

type Props = {
  pathname: string;
  role: string;
  userDeptId: string | null;
  pendingApprovalCount: number;
  featureAccess?: {
    capa: boolean;
    voc: boolean;
    kpi: boolean;
  };
  onSignOut: () => void;
};

function classForLink(
  active: boolean
): string {
  return active ? itemActive : itemBase;
}

export function CtstAppSidebar({
  pathname,
  role,
  userDeptId,
  pendingApprovalCount,
  featureAccess,
  onSignOut,
}: Props) {
  const access = featureAccess ?? { capa: true, voc: true, kpi: true };
  const kpiListHref = hrefDashboardDepartmentList(role, userDeptId);

  const kpiListActive =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/department/");

  const approvalsActive = pathname === "/dashboard/approvals";
  const settingsActive = pathname === "/dashboard/settings";
  const capaActive = pathname === "/capa-simulator" || pathname.startsWith("/capa-simulator");
  const vocActive = pathname === "/voc" || pathname.startsWith("/voc");

  return (
    <aside className="flex w-full flex-shrink-0 flex-col border-b border-sky-100 bg-white md:w-64 md:border-b-0 md:border-r md:border-sky-100">
      <div className="flex min-h-[95px] items-center gap-2 border-b border-sky-100 px-4 py-3">
        <div className="flex h-16 w-[100px] shrink-0 items-center justify-center overflow-hidden rounded-xl">
          <img
            src="/logo_ctst.png"
            alt="CTST"
            className="h-full w-full object-contain"
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight text-slate-800">
            CTST 통합 시스템
          </p>
        </div>
      </div>

      <nav
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3"
        aria-label="주 메뉴"
      >
        <NavSection title="바로가기">
          <a
            href={CTST_PUBLIC_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={itemBase}
          >
            <Globe className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
            <span className="min-w-0">CTST 공식 홈페이지</span>
            <ExternalLink
              className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60"
              aria-hidden
            />
          </a>
          <a
            href="http://59.12.17.181:3000/"
            target="_blank"
            rel="noopener noreferrer"
            className={itemBase}
          >
            <Globe className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
            <span className="min-w-0">RAMP (AI Services)</span>
            <ExternalLink
              className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60"
              aria-hidden
            />
          </a>
        </NavSection>

        {access.capa ? (
          <NavSection title="CAPA">
            <Link
              href="/capa-simulator"
              className={classForLink(capaActive)}
            >
              <Gauge className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
              CAPA Simulator
            </Link>
          </NavSection>
        ) : null}

        {access.kpi ? (
          <NavSection title="KPI">
            <Link
              href={kpiListHref}
              className={classForLink(kpiListActive)}
            >
              <BarChart3 className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
              KPI 대시보드
            </Link>
            {canAccessApprovalsPage(role) ? (
              <Link
                href="/dashboard/approvals"
                className={classForLink(approvalsActive)}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                실적 승인 관리
                {pendingApprovalCount > 0 ? (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {pendingApprovalCount}
                  </span>
                ) : null}
              </Link>
            ) : null}
            {access.voc ? (
              <Link href="/voc" className={classForLink(vocActive)}>
                <MessageSquareText className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                KPI VOC
              </Link>
            ) : null}
          </NavSection>
        ) : null}

        {canAccessSystemSettings(role) ? (
          <NavSection title="관리자">
            <Link
              href="/dashboard/settings"
              className={classForLink(settingsActive)}
            >
              <Settings className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
              시스템 설정
            </Link>
          </NavSection>
        ) : null}
      </nav>

      <div className="border-t border-sky-100 p-3">
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden />
          로그아웃
        </button>
      </div>
    </aside>
  );
}
