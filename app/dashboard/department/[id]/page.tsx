import type { Metadata } from "next";
import { DepartmentDetailClient } from "./department-detail-client";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "부서 KPI",
    description: `부서 ${id} KPI 상세`,
  };
}

export default async function DepartmentKpiPage({ params }: Props) {
  const { id } = await params;
  return <DepartmentDetailClient departmentId={id} />;
}
