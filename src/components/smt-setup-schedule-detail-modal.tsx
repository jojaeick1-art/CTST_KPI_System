"use client";

import {
  ConstructionScheduleDetailModal,
  type ConstructionScheduleDetailModalProps,
  type ConstructionScheduleLabels,
} from "@/src/components/campus2-schedule-detail-modal";
import { SmtSetupSchedulePerformanceModal } from "@/src/components/smt-setup-schedule-performance-modal";
import {
  useDeleteSmtSetupWeeklyPerformance,
  useUpsertSmtSetupOverallAchievement,
} from "@/src/hooks/useSmtSetupSchedule";

const SMT_SETUP_LABELS: ConstructionScheduleLabels = {
  title: "SMT Line Set-up 현황",
  subtitleCanEdit: "SMT Line Set-up 일정과 주간 실적을 등록·수정·삭제할 수 있습니다.",
  subtitleReadOnly: "SMT Line Set-up 일정과 주간 실적을 조회할 수 있습니다.",
  permissionHint:
    "실적 등록·수정·삭제와 종합 달성률 입력은 그룹장·팀장·관리자만 할 수 있습니다.",
  scheduleColumnHeader: "SMT Line Set-up 일정",
  deleteConfirm: (weekLabel) =>
    `「${weekLabel}」 주간 실적을 삭제할까요?\n선택한 일정·주차의 증빙·특이사항이 제거됩니다.`,
  progressAriaLabel: "SMT Line Set-up 종합 달성률",
};

export function SmtSetupScheduleDetailModal(
  props: Omit<
    ConstructionScheduleDetailModalProps,
    "labels" | "PerformanceModal" | "overallMutation" | "deleteWeeklyMutation"
  >
) {
  const overallMutation = useUpsertSmtSetupOverallAchievement(props.year);
  const deleteWeeklyMutation = useDeleteSmtSetupWeeklyPerformance(props.year);
  return (
    <ConstructionScheduleDetailModal
      labels={SMT_SETUP_LABELS}
      PerformanceModal={SmtSetupSchedulePerformanceModal}
      overallMutation={overallMutation}
      deleteWeeklyMutation={deleteWeeklyMutation}
      scheduleTableLayout="smt-line-phase"
      panelMaxWidthClass="max-w-[min(100%,96.8rem)]"
      {...props}
    />
  );
}
