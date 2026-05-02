import type { Metadata } from "next";
import { KpiInboxPage } from "../kpi-inbox-client";

export const metadata: Metadata = {
  title: "회수함",
  description: "CTST KPI — 내 실적 회수 목록",
};

export default function PerformanceWithdrawnPage() {
  return <KpiInboxPage variant="withdrawn" />;
}
