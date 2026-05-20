import { redirect } from "next/navigation";

/** @deprecated 멀티 스케줄 제거 — 단일 CAPA 시뮬로 이동 */
export default function CapaMultiRedirectPage() {
  redirect("/capa-simulator/single");
}
