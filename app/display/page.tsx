import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { DisplayClient } from "./display-client";

export const metadata: Metadata = {
  title: "KPI 전시",
  description: "CTST KPI TV 전시 슬라이드쇼",
};

function DisplayFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-sky-50">
      <Loader2 className="h-10 w-10 animate-spin text-sky-600" aria-hidden />
    </div>
  );
}

export default function DisplayPage() {
  return (
    <Suspense fallback={<DisplayFallback />}>
      <DisplayClient />
    </Suspense>
  );
}
