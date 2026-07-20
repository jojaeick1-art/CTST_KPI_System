import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { VocPlaceholderContent } from "./voc-placeholder";

export const metadata: Metadata = {
  title: "VOC",
  description: "CTST KPI — VOC",
};

export default function VocPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-sky-50/60">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
        </div>
      }
    >
      <VocPlaceholderContent />
    </Suspense>
  );
}
