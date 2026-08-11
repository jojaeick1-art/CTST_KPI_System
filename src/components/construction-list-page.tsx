"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useDashboardProfile } from "@/src/hooks/useKpiQueries";
import {
  useConstructionBundle,
  useCreateConstructionProject,
  useDeleteConstructionProject,
  useUpdateConstructionProject,
} from "@/src/hooks/useConstructionProjects";
import { canEditCampus2Schedule } from "@/src/lib/rbac";
import { CURRENT_KPI_YEAR } from "@/src/lib/kpi-queries";
import {
  formatKrw,
  type ConstructionDomain,
  type ConstructionProject,
  type ConstructionProjectSummary,
} from "@/src/lib/construction-projects";
import { ConstructionStatusBadge } from "@/src/components/construction-status-badge";
import { ConstructionProjectFormModal } from "@/src/components/construction-project-form-modal";
import { ConstructionProjectDetailModal } from "@/src/components/construction-project-detail-modal";

type Props = {
  /** 화면 상단 제목 ("공사" / "Set-up") */
  pageTitle: string;
  domain: ConstructionDomain;
};

/** 공사·Set-up 공용 목록 화면 — 투자 메뉴와 동일한 배치 */
export function ConstructionListPage({ pageTitle, domain }: Props) {
  const profileQuery = useDashboardProfile();
  const role = profileQuery.data?.profile.role ?? "";
  const canEdit = canEditCampus2Schedule(role);
  const year = CURRENT_KPI_YEAR;

  const bundleQuery = useConstructionBundle(
    domain,
    profileQuery.isSuccess && profileQuery.data !== null,
    year
  );
  const createProjectMutation = useCreateConstructionProject(domain, year);
  const updateProjectMutation = useUpdateConstructionProject(domain, year);
  const deleteProjectMutation = useDeleteConstructionProject(domain, year);

  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ConstructionProject | null>(null);
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  const projects = useMemo(() => bundleQuery.data?.projects ?? [], [bundleQuery.data]);

  const overview = useMemo(() => {
    const totalProjects = projects.length;
    const totalCost = projects.reduce((sum, item) => sum + item.totalCost, 0);
    const overallProgress = totalProjects
      ? Math.round(
          projects.reduce((sum, item) => sum + item.progressRate, 0) / totalProjects
        )
      : 0;
    const completedCount = projects.filter(
      (item) => item.project.status === "completed"
    ).length;
    const delayedCount = projects.reduce((sum, item) => sum + item.delayedTaskCount, 0);
    return { totalProjects, totalCost, overallProgress, completedCount, delayedCount };
  }, [projects]);

  if (profileQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
      </div>
    );
  }

  const openSummary = projects.find((item) => item.project.id === openProjectId) ?? null;
  const columnCount = (canEdit ? 7 : 6) + (domain.hasCost ? 1 : 0);

  async function handleDeleteProject(summary: ConstructionProjectSummary) {
    const ok = window.confirm(
      `'${summary.project.title}' ${domain.labels.projectNoun}을(를) 삭제할까요?\n연결된 ${domain.labels.taskNoun} ${summary.tasks.length}건과 주간 실적·증빙도 함께 삭제됩니다.`
    );
    if (!ok) return;
    try {
      await deleteProjectMutation.mutateAsync(summary.project.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.");
    }
  }

  return (
    <>
      <header className="sticky top-0 z-20 h-[95px] shrink-0 border-b border-sky-200 bg-white/95 px-4 shadow-sm backdrop-blur-md sm:px-8">
        <div className="flex h-full items-center gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
              {pageTitle}
            </h1>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 py-6 sm:p-8">
        <section className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
            <div className="flex min-h-[7.5rem] flex-col justify-center rounded-2xl border border-sky-200 bg-white p-3 shadow-sm shadow-sky-100/40 sm:min-h-0">
              <p className="text-xs font-medium text-slate-500">기준</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {new Date().getFullYear()}년 {new Date().getMonth() + 1}월
              </p>
            </div>
            <div className="flex min-h-[7.5rem] flex-col justify-center rounded-2xl border border-sky-200 bg-white p-3 shadow-sm shadow-sky-100/40 sm:min-h-0">
              <p className="text-xs font-medium text-slate-500">종합 진행률</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-sky-700">
                {overview.overallProgress}%
              </p>
            </div>
            <div className="flex min-h-[7.5rem] flex-col justify-center rounded-2xl border border-sky-200 bg-white p-3 shadow-sm shadow-sky-100/40 sm:min-h-0">
              <p className="text-xs font-medium text-slate-500">
                {domain.hasCost ? "총 공사비용" : "지연 항목"}
              </p>
              <p
                className={`mt-2 truncate text-2xl font-bold tracking-tight ${
                  domain.hasCost
                    ? "text-amber-700"
                    : overview.delayedCount > 0
                      ? "text-red-600"
                      : "text-emerald-700"
                }`}
              >
                {domain.hasCost
                  ? formatKrw(overview.totalCost)
                  : `${overview.delayedCount}건`}
              </p>
            </div>
            <div className="flex min-h-[7.5rem] flex-col justify-center rounded-2xl border border-sky-200 bg-white p-3 shadow-sm shadow-sky-100/40 sm:min-h-0">
              <p className="text-xs font-medium text-slate-500">완료 건 / 전체 건</p>
              <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-800">
                {overview.completedCount}
                <span className="mx-1 text-xl font-semibold text-slate-400">/</span>
                <span className="text-slate-600">{overview.totalProjects}</span>
              </p>
              {domain.hasCost && overview.delayedCount > 0 ? (
                <p className="mt-1 text-xs font-semibold text-red-600">
                  지연 {overview.delayedCount}건
                </p>
              ) : null}
            </div>
          </div>
          {canEdit ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditingProject(null);
                  setFormOpen(true);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-indigo-600 px-2.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" /> {domain.labels.projectNoun} 추가
              </button>
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm shadow-sky-100/40">
          <div className="overflow-auto">
            <table className="min-w-[980px] w-full border-collapse text-sm">
              <thead>
                <tr className="bg-sky-50/80 text-slate-700">
                  <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">
                    {domain.labels.projectTitleColumn}
                  </th>
                  <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">
                    세부 내용
                  </th>
                  {domain.hasCost ? (
                    <th className="border-b border-sky-100 px-3 py-3 text-right font-semibold">
                      총 공사비용(￦)
                    </th>
                  ) : null}
                  <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">
                    담당자
                  </th>
                  <th className="border-b border-sky-100 px-3 py-3 text-center font-semibold">
                    {domain.labels.taskNoun}
                  </th>
                  <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">
                    진행률
                  </th>
                  <th className="border-b border-sky-100 px-3 py-3 text-center font-semibold">
                    상태
                  </th>
                  {canEdit ? (
                    <th className="border-b border-sky-100 px-3 py-3 text-left font-semibold">
                      관리
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {bundleQuery.isPending ? (
                  <tr>
                    <td colSpan={columnCount} className="px-3 py-10 text-center">
                      <Loader2
                        className="mx-auto h-6 w-6 animate-spin text-sky-600"
                        aria-hidden
                      />
                    </td>
                  </tr>
                ) : bundleQuery.isError ? (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className="px-3 py-10 text-center text-sm text-slate-600"
                    >
                      목록을 불러오지 못했습니다.{" "}
                      {bundleQuery.error instanceof Error ? bundleQuery.error.message : ""}
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className="px-3 py-10 text-center text-sm text-slate-600"
                    >
                      등록된 {domain.labels.projectNoun}이(가) 없습니다.
                      {canEdit
                        ? ` 우측 상단의 [${domain.labels.projectNoun} 추가] 버튼으로 등록해 주세요.`
                        : ""}
                    </td>
                  </tr>
                ) : (
                  projects.map((summary) => {
                    const { project, tasks, totalCost, progressRate, delayedTaskCount } =
                      summary;
                    const progress = Math.round(progressRate);
                    return (
                      <tr
                        key={project.id}
                        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/70"
                        onClick={() => setOpenProjectId(project.id)}
                      >
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {project.title}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {project.description?.trim() || "-"}
                        </td>
                        {domain.hasCost ? (
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-800">
                            {formatKrw(totalCost)}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-slate-800">
                          {project.managerName?.trim() || "-"}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-slate-800">
                          {tasks.length}건
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="inline-flex min-w-12 justify-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
                              {progress}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col items-center gap-1">
                            <ConstructionStatusBadge status={project.status} />
                            {delayedTaskCount > 0 ? (
                              <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200">
                                지연 {delayedTaskCount}건
                              </span>
                            ) : null}
                          </div>
                        </td>
                        {canEdit ? (
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setEditingProject(project);
                                  setFormOpen(true);
                                }}
                                className="inline-flex h-8 items-center rounded-md bg-sky-600 px-2 text-xs text-white hover:bg-sky-700"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteProject(summary);
                                }}
                                className="inline-flex h-8 items-center rounded-md border border-red-200 bg-red-50 px-2 text-xs text-red-700 hover:bg-red-100"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ConstructionProjectFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingProject(null);
        }}
        domain={domain}
        editingProject={editingProject}
        submitting={createProjectMutation.isPending || updateProjectMutation.isPending}
        onSubmit={async (input) => {
          if (editingProject) {
            await updateProjectMutation.mutateAsync({ ...input, id: editingProject.id });
            return;
          }
          await createProjectMutation.mutateAsync({ ...input, domain });
        }}
      />

      {openSummary ? (
        <ConstructionProjectDetailModal
          isOpen
          onClose={() => setOpenProjectId(null)}
          domain={domain}
          year={year}
          summary={openSummary}
          weekly={bundleQuery.data?.weekly ?? []}
          weekColumns={
            bundleQuery.data?.weekColumnsByProject[openSummary.project.id] ?? []
          }
          canEdit={canEdit}
        />
      ) : null}
    </>
  );
}
