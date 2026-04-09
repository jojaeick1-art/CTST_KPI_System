import type { Metadata } from "next";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = {
  title: "시스템 설정",
  description: "CTST KPI — 부서 및 입력 마감일 관리",
};

export default function SettingsPage() {
  return <SettingsClient />;
}
