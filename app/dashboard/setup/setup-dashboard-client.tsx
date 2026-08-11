"use client";

import { ConstructionListPage } from "@/src/components/construction-list-page";
import { SETUP_DOMAIN } from "@/src/lib/construction-projects";

export function SetupDashboardClient() {
  return <ConstructionListPage pageTitle="Set-up" domain={SETUP_DOMAIN} />;
}
