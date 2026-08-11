import type { Metadata } from "next";
import { AccountsClient } from "./accounts-client";

export const metadata: Metadata = {
  title: "계정 관리",
  description: "CTST KPI — 계정별 직급·소속 부서·겸직 관리",
};

export default function AccountsPage() {
  return <AccountsClient />;
}
