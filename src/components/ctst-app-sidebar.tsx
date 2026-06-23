"use client";

import Link from "next/link";
import { ChevronDown, LogOut } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CTST_PUBLIC_SITE_URL,
  ESD_LOG_SERVER_URL,
} from "@/src/lib/ctst-public-site";
import {
  useAppFeatureAvailability,
  useDashboardProfile,
  useKpiVocRequests,
  useMyPerformanceInbox,
} from "@/src/hooks/useKpiQueries";
import {
  KPI_INBOX_SEEN_EVENT,
  countUnreadInboxRows,
  markAllInboxRowsSeen,
} from "@/src/lib/kpi-inbox-seen";
import {
  USER_NOTIFICATION_SEEN_EVENT,
  countAdminUnseenPendingVoc,
  loadSeenNotificationIds,
  markAdminPendingVocNotificationsSeen,
} from "@/src/lib/user-notification-inbox";
import { AppToast, type ToastState } from "@/src/components/ui/toast";
import {
  canAccessApprovalsPage,
  canAccessEsdLogServer,
  canAccessSystemSettings,
  canManageCapaRecipe,
  hrefDashboardDepartmentList,
  isAdminRole,
} from "@/src/lib/rbac";

const itemBase =
  "flex min-h-[2.5rem] w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-600 outline-none transition-all duration-200 hover:border-sky-200/70 hover:bg-white hover:text-slate-900 hover:shadow-sm hover:shadow-slate-200/50 focus-visible:ring-2 focus-visible:ring-sky-400/50";

/** 슬라이딩 배경이 테두리·배경을 대신함 — 활성 링크는 텍스트 강조만 */
const itemActiveOverlay =
  "relative z-10 border-transparent bg-transparent shadow-none font-semibold text-sky-900 hover:border-transparent hover:bg-transparent hover:shadow-none hover:text-sky-900";

const slidingIndicatorClass =
  "pointer-events-none absolute left-0 right-0 top-0 z-0 rounded-xl border border-sky-200/90 border-l-[3px] border-l-sky-500 bg-white shadow-sm shadow-sky-200/40 ring-1 ring-sky-100/90 will-change-[transform,height] transition-[transform,height,opacity] duration-300 ease-out motion-reduce:transition-none";

type NavSlot =
  | "capaRecipeMaster"
  | "capaSingle"
  | "kpi"
  | "approvals"
  | "kpiRejected"
  | "kpiWithdrawn"
  | "voc"
  | "investment"
  | "construction"
  | "setup"
  | "settings";

type IndicatorBox = { top: number; height: number; opacity: number };
type SectionKey = "shortcut" | "capa" | "kpi" | "etc" | "admin";

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
  if (access.capa && pathname.startsWith("/capa-simulator")) {
    if (pathname.startsWith("/capa-simulator/recipe-master")) {
      return "capaRecipeMaster";
    }
    return "capaSingle";
  }

  if (
    access.kpi &&
    (pathname === "/dashboard" ||
      pathname.startsWith("/dashboard/department/"))
  ) {
    return "kpi";
  }

  if (access.kpi && pathname === "/dashboard/approvals") {
    return "approvals";
  }

  if (access.kpi && pathname === "/dashboard/performance-rejected") {
    return "kpiRejected";
  }

  if (access.kpi && pathname === "/dashboard/performance-withdrawn") {
    return "kpiWithdrawn";
  }

  if (
    access.kpi &&
    access.voc &&
    (pathname === "/voc" || pathname.startsWith("/voc"))
  ) {
    return "voc";
  }

  if (access.kpi && pathname === "/dashboard/construction") {
    return "construction";
  }

  if (access.kpi && pathname === "/dashboard/investment") {
    return "investment";
  }

  if (access.kpi && pathname === "/dashboard/setup") {
    return "setup";
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
      if (!next) {
        setBox((prev) =>
          prev.opacity === 0 ? prev : { top: 0, height: 0, opacity: 0 },
        );
        return;
      }
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
  sectionKey,
  title,
  expanded,
  onToggle,
  children,
}: {
  sectionKey: SectionKey;
  title: string;
  expanded: boolean;
  onToggle: (section: SectionKey) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 first:mt-1">
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="mb-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-1 text-left text-base font-bold tracking-tight text-slate-700 transition-colors hover:bg-slate-100/70"
        aria-expanded={expanded}
      >
        <span
          className="h-4 w-0.5 shrink-0 rounded-full bg-gradient-to-b from-sky-400 to-sky-600"
          aria-hidden
        />
        <span className="flex-1">{title}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      <div
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0">
          <div className="flex flex-col gap-1">{children}</div>
        </div>
      </div>
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

function sectionForSlot(slot: NavSlot | null): SectionKey | null {
  if (!slot) return null;
  if (slot === "settings") return "admin";
  if (slot === "construction" || slot === "setup" || slot === "investment")
    return "etc";
  if (slot === "capaRecipeMaster" || slot === "capaSingle") return "capa";
  return "kpi";
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

  const profileQuery = useDashboardProfile();
  const featureQuery = useAppFeatureAvailability(
    profileQuery.isSuccess && profileQuery.data !== null
  );
  const uid = profileQuery.data?.session.user.id;
  const inboxQueryEnabled =
    access.kpi &&
    profileQuery.isSuccess &&
    profileQuery.data !== null &&
    typeof uid === "string" &&
    uid.length > 0 &&
    (isAdminRole(profileQuery.data.profile.role) ||
      (featureQuery.isSuccess && featureQuery.data?.kpi === true));

  const inboxQuery = useMyPerformanceInbox(inboxQueryEnabled);

  const [inboxSeenTick, setInboxSeenTick] = useState(0);
  useEffect(() => {
    const fn = () => setInboxSeenTick((t) => t + 1);
    window.addEventListener(KPI_INBOX_SEEN_EVENT, fn);
    return () => window.removeEventListener(KPI_INBOX_SEEN_EVENT, fn);
  }, []);

  const rejectedUnread = useMemo(() => {
    void inboxSeenTick;
    return countUnreadInboxRows(
      inboxQuery.data?.rejected ?? [],
      uid,
      "rejected"
    );
  }, [inboxQuery.data?.rejected, uid, inboxSeenTick]);

  const withdrawnUnread = useMemo(() => {
    void inboxSeenTick;
    return countUnreadInboxRows(
      inboxQuery.data?.withdrawn ?? [],
      uid,
      "withdrawn"
    );
  }, [inboxQuery.data?.withdrawn, uid, inboxSeenTick]);

  const adminVocEnabled =
    isAdminRole(profileQuery.data?.profile.role) &&
    access.voc &&
    typeof uid === "string" &&
    uid.length > 0;
  const vocQuery = useKpiVocRequests(adminVocEnabled);

  const [notificationSeenTick, setNotificationSeenTick] = useState(0);
  useEffect(() => {
    const onSeen = () => setNotificationSeenTick((t) => t + 1);
    window.addEventListener(USER_NOTIFICATION_SEEN_EVENT, onSeen);
    return () => window.removeEventListener(USER_NOTIFICATION_SEEN_EVENT, onSeen);
  }, []);

  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    tone: "error",
  });
  useEffect(() => {
    if (!toast.open) return;
    const t = window.setTimeout(
      () => setToast((prev) => ({ ...prev, open: false })),
      2000,
    );
    return () => clearTimeout(t);
  }, [toast.open, toast.message]);

  const adminVocUnread = useMemo(() => {
    void notificationSeenTick;
    if (!adminVocEnabled || !uid) return 0;
    const seen = loadSeenNotificationIds();
    return countAdminUnseenPendingVoc(vocQuery.data ?? [], uid, seen);
  }, [adminVocEnabled, uid, vocQuery.data, notificationSeenTick]);

  useEffect(() => {
    if (!uid || !inboxQuery.data) return;
    if (pathname === "/dashboard/performance-rejected") {
      markAllInboxRowsSeen(
        uid,
        "rejected",
        (inboxQuery.data.rejected ?? []).map((r) => r.id)
      );
    } else if (pathname === "/dashboard/performance-withdrawn") {
      markAllInboxRowsSeen(
        uid,
        "withdrawn",
        (inboxQuery.data.withdrawn ?? []).map((r) => r.id)
      );
    }
  }, [pathname, uid, inboxQuery.data]);

  useEffect(() => {
    if (!adminVocEnabled || !uid || pathname !== "/voc") return;
    markAdminPendingVocNotificationsSeen(vocQuery.data ?? [], uid);
  }, [pathname, adminVocEnabled, uid, vocQuery.data]);

  const activeSlot = resolveActiveNavSlot(pathname, role, access);

  const linkRefs = useRef<Partial<Record<NavSlot, HTMLAnchorElement | null>>>(
    {},
  );
  const innerRef = useRef<HTMLDivElement>(null);

  const capaRecipeMasterActive = activeSlot === "capaRecipeMaster";
  const capaSingleActive = activeSlot === "capaSingle";
  const showCapaRecipeMaster = canManageCapaRecipe(role);
  const canOpenEsdLogServer = canAccessEsdLogServer(role);
  const kpiListActive = activeSlot === "kpi";
  const approvalsActive = activeSlot === "approvals";
  const kpiRejectedActive = activeSlot === "kpiRejected";
  const kpiWithdrawnActive = activeSlot === "kpiWithdrawn";
  const settingsActive = activeSlot === "settings";
  const vocActive = activeSlot === "voc";
  const investmentActive = activeSlot === "investment";
  const constructionActive = activeSlot === "construction";
  const setupActive = activeSlot === "setup";
  const activeSection = sectionForSlot(activeSlot);

  const [expandedSections, setExpandedSections] = useState<
    Record<SectionKey, boolean>
  >({
    shortcut: false,
    capa: activeSection === "capa",
    kpi: activeSection === "kpi",
    etc: false,
    admin: activeSection === "admin",
  });

  useEffect(() => {
    if (!activeSection) return;
    setExpandedSections((prev) =>
      prev[activeSection] ? prev : { ...prev, [activeSection]: true },
    );
  }, [activeSection]);

  const toggleSection = useCallback((section: SectionKey) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);
  const indicatorActiveSlot =
    activeSection && !expandedSections[activeSection] ? null : activeSlot;
  const indicatorBox = useSlidingNavIndicator(
    indicatorActiveSlot,
    linkRefs,
    innerRef,
  );

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-sky-200/90 bg-gradient-to-b from-slate-50 via-white to-sky-50/35 md:sticky md:top-0 md:h-dvh md:max-h-dvh md:w-64 md:overflow-hidden md:border-b-0 md:border-r md:border-sky-200/90 md:shadow-[4px_0_28px_-12px_rgba(15,23,42,0.12)]">
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
        <NavSection
          sectionKey="shortcut"
          title="바로가기"
          expanded={expandedSections.shortcut}
          onToggle={toggleSection}
        >
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
          <button
            type="button"
            className={itemBase}
            onClick={() => {
              if (!canOpenEsdLogServer) {
                setToast({
                  open: true,
                  tone: "error",
                  message: "권한이 없습니다.",
                });
                return;
              }
              window.open(ESD_LOG_SERVER_URL, "_blank", "noopener,noreferrer");
            }}
          >
            <span className="min-w-0">ESD Log Server</span>
          </button>
        </NavSection>

        {access.capa ? (
          <NavSection
            sectionKey="capa"
            title="CAPA Simulator"
            expanded={expandedSections.capa}
            onToggle={toggleSection}
          >
            {showCapaRecipeMaster ? (
              <Link
                ref={(el) => {
                  linkRefs.current.capaRecipeMaster = el;
                }}
                href="/capa-simulator/recipe-master"
                className={classForLink(capaRecipeMasterActive)}
              >
                공정
              </Link>
            ) : null}
            <Link
              ref={(el) => {
                linkRefs.current.capaSingle = el;
              }}
              href="/capa-simulator/single"
              className={classForLink(capaSingleActive)}
            >
              등록
            </Link>
          </NavSection>
        ) : null}

        {access.kpi ? (
          <NavSection
            sectionKey="kpi"
            title="KPI"
            expanded={expandedSections.kpi}
            onToggle={toggleSection}
          >
            <Link
              ref={(el) => {
                linkRefs.current.kpi = el;
              }}
              href={kpiListHref}
              className={classForLink(kpiListActive)}
            >
              전체 대시보드
            </Link>
            <Link
              ref={(el) => {
                linkRefs.current.approvals = el;
              }}
              href="/dashboard/approvals"
              className={classForLink(approvalsActive)}
            >
              실적함
              {canAccessApprovalsPage(role) && pendingApprovalCount > 0 ? (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {pendingApprovalCount}
                </span>
              ) : null}
            </Link>
            <Link
              ref={(el) => {
                linkRefs.current.kpiRejected = el;
              }}
              href="/dashboard/performance-rejected"
              className={classForLink(kpiRejectedActive)}
            >
              반려함
              {rejectedUnread > 0 ? (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {rejectedUnread}
                </span>
              ) : null}
            </Link>
            <Link
              ref={(el) => {
                linkRefs.current.kpiWithdrawn = el;
              }}
              href="/dashboard/performance-withdrawn"
              className={classForLink(kpiWithdrawnActive)}
            >
              회수함
              {withdrawnUnread > 0 ? (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {withdrawnUnread}
                </span>
              ) : null}
            </Link>
            {access.voc ? (
              <Link
                ref={(el) => {
                  linkRefs.current.voc = el;
                }}
                href="/voc"
                className={classForLink(vocActive)}
              >
                VOC
                {adminVocUnread > 0 ? (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {adminVocUnread}
                  </span>
                ) : null}
              </Link>
            ) : null}
          </NavSection>
        ) : null}

        {access.kpi ? (
          <NavSection
            sectionKey="etc"
            title="기타"
            expanded={expandedSections.etc}
            onToggle={toggleSection}
          >
            <Link
              ref={(el) => {
                linkRefs.current.investment = el;
              }}
              href="/dashboard/investment"
              className={classForLink(investmentActive)}
            >
              투자
            </Link>
            <Link
              ref={(el) => {
                linkRefs.current.construction = el;
              }}
              href="/dashboard/construction"
              className={classForLink(constructionActive)}
            >
              공사
            </Link>
            <Link
              ref={(el) => {
                linkRefs.current.setup = el;
              }}
              href="/dashboard/setup"
              className={classForLink(setupActive)}
            >
              Set-up
            </Link>
          </NavSection>
        ) : null}

        {canAccessSystemSettings(role) ? (
          <NavSection
            sectionKey="admin"
            title="관리자"
            expanded={expandedSections.admin}
            onToggle={toggleSection}
          >
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
      <AppToast
        state={toast}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        position="top-center"
      />
    </aside>
  );
}
