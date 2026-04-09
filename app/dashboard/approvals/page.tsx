import type { Metadata } from "next";
import { ApprovalsClient } from "./approvals-client";

export const metadata: Metadata = {
  title: "실적 승인 관리",
  description: "CTST KPI — 승인 대기 실적 검토",
};

export default function ApprovalsPage() {
  return <ApprovalsClient />;
}
