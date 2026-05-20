"use client";

import { capaFormSurfaceClass } from "@/src/components/capa/capa-input-classes";
import { CtstPortalShell } from "@/src/components/ctst-portal-shell";
import { CtstPageHeader } from "@/src/components/ctst-page-header";

export function CapaPageShell({
  title,
  description,
  meta,
  children,
}: {
  title: string;
  description?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <CtstPortalShell>
      <CtstPageHeader title={title} description={description} meta={meta} />
      <div className={`px-4 py-6 sm:p-8 ${capaFormSurfaceClass}`}>{children}</div>
    </CtstPortalShell>
  );
}
