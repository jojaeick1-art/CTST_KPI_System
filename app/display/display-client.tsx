"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Pause, Play } from "lucide-react";
import { DashboardOverviewPanel } from "@/src/components/dashboard-overview-panel";
import { PerformanceModal } from "@/app/dashboard/department/[id]/performance-modal";
import { DISPLAY_SLIDE_INTERVAL_MS } from "@/src/lib/display-config";
import type { DisplayKpiSlide } from "@/src/lib/kpi-queries";
import {
  useDashboardProfile,
  useDashboardSummaryStats,
  useDepartmentKpiSummary,
  useDisplayKpiSlides,
  useKpiPerformances,
} from "@/src/hooks/useKpiQueries";

type DashboardSlide = { type: "dashboard" };
type KpiSlide = { type: "kpi" } & Extract<DisplayKpiSlide, { slideType: "kpi" }>;
type DeptEmptySlide = { type: "dept-empty" } & Extract<
  DisplayKpiSlide,
  { slideType: "dept-empty" }
>;
type DisplaySlide = DashboardSlide | KpiSlide | DeptEmptySlide;

function toDisplaySlides(kpiSlides: DisplayKpiSlide[]): DisplaySlide[] {
  return [
    { type: "dashboard" },
    ...kpiSlides.map((slide) =>
      slide.slideType === "kpi"
        ? ({ type: "kpi" as const, ...slide } satisfies KpiSlide)
        : ({ type: "dept-empty" as const, ...slide } satisfies DeptEmptySlide)
    ),
  ];
}

function slideFooterCaption(slide: DisplaySlide): string {
  if (slide.type === "dashboard") return "전체 대시보드";
  if (slide.type === "dept-empty") return `${slide.deptName} · KPI 없음`;
  const topic = [slide.item.mainTopic, slide.item.subTopic]
    .filter(Boolean)
    .join(" / ");
  return `${slide.deptName} · ${topic || "KPI"}`;
}

function DeptEmptyPanel({ deptName }: { deptName: string }) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-sky-50/90 via-white to-white">
      <div className="shrink-0 border-b border-sky-200 bg-gradient-to-br from-sky-600 to-sky-700 px-6 py-8 text-center">
        <p className="text-4xl font-bold tracking-wide text-white sm:text-5xl">{deptName}</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <p className="text-center text-2xl font-semibold text-slate-700 sm:text-3xl">
          등록된 KPI가 없습니다
        </p>
        <p className="mt-3 text-center text-sm text-slate-500 sm:text-base">
          KPI가 등록되면 다음 순환부터 자동으로 표시됩니다.
        </p>
      </div>
    </div>
  );
}

const FADE_MS = 280;

export function DisplayClient() {
  const router = useRouter();
  const profileQuery = useDashboardProfile();
  const profileReady = profileQuery.isSuccess && profileQuery.data !== null;
  const slidesQuery = useDisplayKpiSlides(profileReady);
  const deptQuery = useDepartmentKpiSummary(profileReady);
  const summaryStatsQuery = useDashboardSummaryStats(profileReady, null);

  const [slideIndex, setSlideIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [progressTick, setProgressTick] = useState(0);
  const prevSlideIndexRef = useRef(0);
  const fadeTimerRef = useRef<number | null>(null);

  const slides = useMemo(
    (): DisplaySlide[] => toDisplaySlides(slidesQuery.data ?? []),
    [slidesQuery.data]
  );

  const totalSlides = slides.length;
  const currentSlide = totalSlides > 0 ? slides[slideIndex % totalSlides] : null;

  const nextSlide = useMemo(() => {
    if (totalSlides <= 1) return null;
    return slides[(slideIndex + 1) % totalSlides];
  }, [slideIndex, slides, totalSlides]);

  const prefetchKpiId =
    nextSlide?.type === "kpi"
      ? nextSlide.item.id
      : currentSlide?.type === "kpi"
        ? currentSlide.item.id
        : null;
  useKpiPerformances(prefetchKpiId);

  const goToSlide = useCallback(
    (targetIndex: number) => {
      if (totalSlides <= 0) return;
      const normalized =
        ((targetIndex % totalSlides) + totalSlides) % totalSlides;
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      setFadeIn(false);
      fadeTimerRef.current = window.setTimeout(() => {
        setSlideIndex(normalized);
        setProgressTick((t) => t + 1);
        setFadeIn(true);
        fadeTimerRef.current = null;
      }, FADE_MS);
    },
    [totalSlides]
  );

  const goBack = useCallback(() => {
    goToSlide(slideIndex - 1);
  }, [goToSlide, slideIndex]);

  const goForward = useCallback(() => {
    goToSlide(slideIndex + 1);
  }, [goToSlide, slideIndex]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      if (prev) setProgressTick((t) => t + 1);
      return !prev;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!profileQuery.isSuccess) return;
    if (profileQuery.data === null) {
      router.replace("/login?next=/display");
    }
  }, [profileQuery.isSuccess, profileQuery.data, router]);

  useEffect(() => {
    if (totalSlides <= 1 || isPaused) return;
    const timer = window.setInterval(() => {
      goToSlide(slideIndex + 1);
    }, DISPLAY_SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [totalSlides, isPaused, slideIndex, progressTick, goToSlide]);

  useEffect(() => {
    if (slideIndex >= totalSlides && totalSlides > 0) {
      setSlideIndex(0);
    }
  }, [slideIndex, totalSlides]);

  const { refetch: refetchSlides } = slidesQuery;
  const { refetch: refetchDepts } = deptQuery;
  const { refetch: refetchSummary } = summaryStatsQuery;

  /** 한 바퀴 돌아 대시보드(첫 슬라이드)로 돌아올 때 목록·통계 갱신 */
  useEffect(() => {
    const prev = prevSlideIndexRef.current;
    prevSlideIndexRef.current = slideIndex;
    const wrappedToDashboard =
      totalSlides > 1 && slideIndex === 0 && prev === totalSlides - 1;
    if (!wrappedToDashboard) return;
    void refetchSlides();
    void refetchDepts();
    void refetchSummary();
  }, [slideIndex, totalSlides, refetchSlides, refetchDepts, refetchSummary]);

  if (profileQuery.isPending || slidesQuery.isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-sky-50">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
          <p className="text-sm">KPI 전시 화면을 준비하는 중…</p>
        </div>
      </div>
    );
  }

  if (profileQuery.isError || slidesQuery.isError) {
    const msg =
      (profileQuery.error instanceof Error && profileQuery.error.message) ||
      (slidesQuery.error instanceof Error && slidesQuery.error.message) ||
      "데이터를 불러오지 못했습니다.";
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-sky-50 px-4">
        <p className="text-center text-sm text-red-700">{msg}</p>
        <button
          type="button"
          onClick={() => router.replace("/login?next=/display")}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          로그인으로 이동
        </button>
      </div>
    );
  }

  if (!profileQuery.data || !currentSlide) {
    return null;
  }

  const progressIndex = slideIndex + 1;
  const footerBtnClass =
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-700 disabled:opacity-40 sm:px-3 sm:text-sm";
  const footerPauseBtnClass = `${footerBtnClass} w-[5.75rem] sm:w-[7.25rem]`;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-900">
      <div
        className={`min-h-0 flex-1 transition-opacity duration-300 ${
          fadeIn ? "opacity-100" : "opacity-0"
        }`}
      >
        {currentSlide.type === "dashboard" ? (
          <DashboardOverviewPanel
            summaryStats={summaryStatsQuery.data}
            summaryPending={summaryStatsQuery.isPending}
            departments={deptQuery.data ?? []}
            departmentsPending={deptQuery.isPending}
            departmentsError={deptQuery.isError}
          />
        ) : currentSlide.type === "dept-empty" ? (
          <DeptEmptyPanel deptName={currentSlide.deptName} />
        ) : (
          <div className="h-full min-h-0 bg-white">
            <PerformanceModal
              isOpen
              kioskMode
              kioskDeptName={currentSlide.deptName}
              kpiItem={currentSlide.item}
              canEditPerformance={false}
              profileRole={profileQuery.data.profile.role}
              profileUserId={profileQuery.data.profile.id}
              onClose={() => {}}
            />
          </div>
        )}
      </div>

      <footer className="relative flex min-h-[3.75rem] shrink-0 items-center border-t border-slate-700/80 bg-slate-900/95 px-4 py-2.5 text-white backdrop-blur-sm sm:min-h-[4rem] sm:px-6">
        <div className="absolute inset-y-0 left-4 flex items-center sm:left-6">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              className={footerBtnClass}
              disabled={totalSlides <= 1}
              onClick={goBack}
              aria-label="뒤로 가기"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">뒤로 가기</span>
              <span className="sm:hidden">뒤로</span>
            </button>
            <button
              type="button"
              className={footerPauseBtnClass}
              onClick={togglePause}
              aria-label={isPaused ? "시작" : "일시 정지"}
            >
              {isPaused ? (
                <Play className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <Pause className="h-4 w-4 shrink-0" aria-hidden />
              )}
              <span className="hidden sm:inline">
                {isPaused ? "시작" : "일시 정지"}
              </span>
              <span className="sm:hidden">{isPaused ? "시작" : "정지"}</span>
            </button>
            <button
              type="button"
              className={footerBtnClass}
              disabled={totalSlides <= 1}
              onClick={goForward}
              aria-label="앞으로 가기"
            >
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">앞으로 가기</span>
              <span className="sm:hidden">앞으로</span>
            </button>
          </div>
        </div>

        <div
          className="mx-auto inline-grid max-w-[calc(100%-17rem)] gap-x-2 gap-y-1 sm:max-w-[calc(100%-20rem)]"
          style={{ gridTemplateColumns: "min(45.5vw, 36rem) auto" }}
        >
          <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 text-xs sm:text-sm">
            <span className="shrink-0 rounded-full bg-sky-500/20 px-2.5 py-0.5 font-semibold text-sky-200 ring-1 ring-sky-400/30">
              KPI 전시
            </span>
            <span className="truncate text-slate-300">
              {slideFooterCaption(currentSlide)}
            </span>
          </div>

          <div
            className="col-start-1 row-start-2 h-1.5 overflow-hidden rounded-full bg-slate-700"
            aria-hidden
          >
            <div
              key={`${slideIndex}-${progressTick}`}
              className="h-full w-full origin-left bg-sky-400"
              style={{
                animation: `display-progress ${DISPLAY_SLIDE_INTERVAL_MS}ms linear forwards`,
                animationPlayState: isPaused ? "paused" : "running",
              }}
            />
          </div>

          <div className="col-start-2 row-start-1 row-span-2 flex items-center whitespace-nowrap text-xs tabular-nums text-slate-400 sm:text-sm">
            {progressIndex} / {totalSlides} · {DISPLAY_SLIDE_INTERVAL_MS / 1000}초
          </div>
        </div>
      </footer>
    </div>
  );
}
