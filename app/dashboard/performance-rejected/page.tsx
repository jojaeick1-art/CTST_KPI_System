import type { Metadata } from "next";
import { KpiInboxPage } from "../kpi-inbox-client";

export const metadata: Metadata = {
  title: "반려함",
  description: "CTST KPI — 내 실적 반려 목록",
};

export default function PerformanceRejectedPage() {
  return <KpiInboxPage variant="rejected" />;
}
