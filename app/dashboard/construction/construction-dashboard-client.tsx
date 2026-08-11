"use client";

import { ConstructionListPage } from "@/src/components/construction-list-page";
import { CONSTRUCTION_DOMAIN } from "@/src/lib/construction-projects";

export function ConstructionDashboardClient() {
  return <ConstructionListPage pageTitle="공사" domain={CONSTRUCTION_DOMAIN} />;
}
