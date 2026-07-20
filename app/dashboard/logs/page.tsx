import type { Metadata } from "next";
import { LogsClient } from "./logs-client";

export const metadata: Metadata = {
  title: "로그 조회",
  description: "CTST KPI — 관리자 접속 로그 조회",
};

export default function LogsPage() {
  return <LogsClient />;
}
