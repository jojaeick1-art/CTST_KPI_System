"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CTST_PUBLIC_SITE_URL } from "@/src/lib/ctst-public-site";
import {
  canAccessApprovalsPage,
  canAccessSystemSettings,
  hrefDashboardDepartmentList,
} from "@/src/lib/rbac";

const itemBase =
  "flex min-h-[2.5rem] w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-600 outline-none transition-all duration-200 hover:border-sky-200/70 hover:bg-white hover:text-slate-900 hover:shadow-sm hover:shadow-slate-200/50 focus-visible:ring-2 focus-visible:ring-sky-400/50";

/** 슬라이딩 배경이 테두리·배경을 대신함 — 활성 링크는 텍스트 강조만 */
const itemActiveOverlay =
  "relative z-10 border-transparent bg-transparent shadow-none font-semibold text-sky-900 hover:border-transparent hover:bg-transparent hover:shadow-none hover:text-sky-900";

const slidingIndicatorClass =
  "pointer-events-none absolute left-0 right-0 top-0 z-0 rounded-xl border border-sky-200/90 border-l-[3px] border-l-sky-500 bg-white shadow-sm shadow-sky-200/40 ring-1 ring-sky-100/90 will-change-[transform,height] transition-[transform,height,opacity] duration-[250ms] motion-reduce:transition-none [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]";

type NavSlot = "capa" | "kpi" | "approvals" | "voc" | "settings";

type IndicatorBox = { top: number; height: number; opacity: number };

/** 페이지 전환 시 사이드바가 리마운트되어도 직전 위치를 유지해 메뉴→메뉴 슬라이드 가능 */
let sidebarIndicatorCache: IndicatorBox = { top: 0, height: 0, opacity: 0 };

function readSidebarIndicatorCache(): IndicatorBox {
  return { ...sidebarIndicatorCache };
}

function writeSidebarIndicatorCache(box: IndicatorBox): void {
  sidebarIndicatorCache = { ...box };
}

function resolveActiveNavSlot(
  pathname: string,
  role: string,
  access: { capa: boolean; voc: boolean; kpi: boolean },
): NavSlot | null {
  if (
    access.capa &&
    (pathname === "/capa-simulator" || pathname.startsWith("/capa-simulator"))
  ) {
    return "capa";
  }

  if (
    access.kpi &&
    (pathname === "/dashboard" ||
      pathname.startsWith("/dashboard/department/"))
  ) {
    return "kpi";
  }

  if (
    access.kpi &&
    canAccessApprovalsPage(role) &&
    pathname === "/dashboard/approvals"
  ) {
    return "approvals";
  }

  if (
    access.kpi &&
    access.voc &&
    (pathname === "/voc" || pathname.startsWith("/voc"))
  ) {
    return "voc";
  }

  if (canAccessSystemSettings(role) && pathname === "/dashboard/settings") {
    return "settings";
  }

  return null;
}

function useSlidingNavIndicator(
  activeSlot: NavSlot | null,
  linkRefs: React.MutableRefObject<Partial<Record<NavSlot, HTMLElement | null>>>,
  innerRef: React.RefObject<HTMLDivElement | null>,
) {
  const [box, setBox] = useState<IndicatorBox>(() =>
    readSidebarIndicatorCache(),
  );
  const prevSlotRef = useRef<NavSlot | null>(null);

  const measure = useCallback((): IndicatorBox | null => {
    const inner = innerRef.current;
    const el = activeSlot ? linkRefs.current[activeSlot] ?? null : null;
    if (!inner || !el || !activeSlot) return null;

    const ir = inner.getBoundingClientRect();
    const lr = el.getBoundingClientRect();
    const top = lr.top - ir.top;
    const height = lr.height;
    if (height <= 0) return null;

    return { top, height, opacity: 1 };
  }, [activeSlot, innerRef, linkRefs]);

  const applyBox = useCallback((next: IndicatorBox, slot: NavSlot | null) => {
    writeSidebarIndicatorCache(next);
    setBox(next);
    prevSlotRef.current = slot;
  }, []);

  useLayoutEffect(() => {
    let rafId = 0;
    const next = measure();

    if (!next) {
      setBox((prev) =>
        prev.opacity === 0 ? prev : { top: 0, height: 0, opacity: 0 },
      );
      prevSlotRef.current = activeSlot;
      return () => cancelAnimationFrame(rafId);
    }

    const cached = readSidebarIndicatorCache();
    const slotChanged = prevSlotRef.current !== activeSlot;
    const shouldDeferSlide =
      slotChanged && (cached.height > 0 || cached.opacity > 0);

    if (shouldDeferSlide) {
      rafId = requestAnimationFrame(() => {
        applyBox(next, activeSlot);
      });
    } else {
      applyBox(next, activeSlot);
    }

    return () => cancelAnimationFrame(rafId);
  }, [activeSlot, measure, applyBox]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const syncResize = () => {
      const next = measure();
      if (!next) return;
      applyBox(next, activeSlot);
    };

    const ro = new ResizeObserver(() => syncResize());
    ro.observe(el);
    window.addEventListener("resize", syncResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncResize);
    };
  }, [measure, applyBox, activeSlot, innerRef]);

  return box;
}

function NavSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 first:mt-1">
      <p className="mb-2 flex items-center gap-2.5 px-3 text-base font-bold tracking-tight text-slate-700">
        <span
          className="h-4 w-0.5 shrink-0 rounded-full bg-gradient-to-b from-sky-400 to-sky-600"
          aria-hidden
        />
        {title}
      </p>
      <div className="flex flex-col gap-1">{children}</div>
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

function classForLink(active: boolean): string {
  return active ? `${itemBase} ${itemActiveOverlay}` : itemBase;
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

  const activeSlot = resolveActiveNavSlot(pathname, role, access);

  const linkRefs = useRef<Partial<Record<NavSlot, HTMLAnchorElement | null>>>(
    {},
  );
  const innerRef = useRef<HTMLDivElement>(null);
  const indicatorBox = useSlidingNavIndicator(activeSlot, linkRefs, innerRef);

  const capaActive = activeSlot === "capa";
  const kpiListActive = activeSlot === "kpi";
  const approvalsActive = activeSlot === "approvals";
  const settingsActive = activeSlot === "settings";
  const vocActive = activeSlot === "voc";

  return (
    <aside className="flex w-full flex-shrink-0 flex-col border-b border-sky-200/90 bg-gradient-to-b from-slate-50 via-white to-sky-50/35 md:w-64 md:border-b-0 md:border-r md:border-sky-200/90 md:shadow-[4px_0_28px_-12px_rgba(15,23,42,0.12)]">
      <div className="flex h-[95px] w-full shrink-0 flex-col items-center justify-center gap-1 border-b border-sky-200/80 bg-white/75 px-3 shadow-[0_1px_0_0_rgba(255,255,255,0.8)_inset] backdrop-blur-[2px]">
        <img
          src="/c-one%20logo.png?v=4"
          alt="C-ONE"
          className="max-h-[50px] w-auto max-w-[200px] object-contain drop-shadow-sm"
        />
        <p className="text-center text-[13px] font-medium leading-tight tracking-tight text-slate-600">
          통합 운영 플랫폼
        </p>
      </div>

      <nav
        className="flex flex-1 flex-col overflow-y-auto"
        aria-label="주 메뉴"
      >
        <div ref={innerRef} className="relative flex flex-col px-2.5 pb-3 pt-2">
          <div
            aria-hidden
            className={slidingIndicatorClass}
            style={{
              height: indicatorBox.height,
              opacity: indicatorBox.opacity,
              transform: `translate3d(0,${indicatorBox.top}px,0)`,
            }}
          />
        <NavSection title="바로가기">
          <a
            href={CTST_PUBLIC_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={itemBase}
          >
            <span className="min-w-0">CTST 공식 홈페이지</span>
          </a>
          <a
            href="http://59.12.17.181:3000/"
            target="_blank"
            rel="noopener noreferrer"
            className={itemBase}
          >
            <span className="min-w-0">RAMP (AI Services)</span>
          </a>
        </NavSection>

        {access.capa ? (
          <NavSection title="CAPA">
            <Link
              ref={(el) => {
                linkRefs.current.capa = el;
              }}
              href="/capa-simulator"
              className={classForLink(capaActive)}
            >
              CAPA Simulator
            </Link>
          </NavSection>
        ) : null}

        {access.kpi ? (
          <NavSection title="KPI">
            <Link
              ref={(el) => {
                linkRefs.current.kpi = el;
              }}
              href={kpiListHref}
              className={classForLink(kpiListActive)}
            >
              KPI 대시보드
            </Link>
            {canAccessApprovalsPage(role) ? (
              <Link
                ref={(el) => {
                  linkRefs.current.approvals = el;
                }}
                href="/dashboard/approvals"
                className={classForLink(approvalsActive)}
              >
                실적 승인 관리
                {pendingApprovalCount > 0 ? (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {pendingApprovalCount}
                  </span>
                ) : null}
              </Link>
            ) : null}
            {access.voc ? (
              <Link
                ref={(el) => {
                  linkRefs.current.voc = el;
                }}
                href="/voc"
                className={classForLink(vocActive)}
              >
                KPI VOC
              </Link>
            ) : null}
          </NavSection>
        ) : null}

        {canAccessSystemSettings(role) ? (
          <NavSection title="관리자">
            <Link
              ref={(el) => {
                linkRefs.current.settings = el;
              }}
              href="/dashboard/settings"
              className={classForLink(settingsActive)}
            >
              시스템 설정
            </Link>
          </NavSection>
        ) : null}
        </div>
      </nav>

      <div className="border-t border-sky-200/80 bg-slate-50/90 p-3 shadow-[0_-6px_16px_-8px_rgba(15,23,42,0.06)]">
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition-all duration-200 hover:border-red-200/80 hover:bg-white hover:text-red-700 hover:shadow-sm"
        >
          <LogOut className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          로그아웃
        </button>
      </div>
    </aside>
  );
}
