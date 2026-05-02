import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { DepartmentDetailClient } from "./department-detail-client";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "부서 KPI",
    description: `부서 ${id} KPI 상세`,
  };
}

function DepartmentDetailFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-sky-50/50">
      <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
    </div>
  );
}

export default async function DepartmentKpiPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<DepartmentDetailFallback />}>
      <DepartmentDetailClient departmentId={id} />
    </Suspense>
  );
}
