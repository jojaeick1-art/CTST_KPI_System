import { redirect } from "next/navigation";

/** 기존 /hub 북마크 호환 */
export default function HubRedirectPage() {
  redirect("/dashboard");
}
