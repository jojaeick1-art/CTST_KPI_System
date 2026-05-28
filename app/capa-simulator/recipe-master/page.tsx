import type { Metadata } from "next";
import { ProcessHubClient } from "./process-hub-client";

export const metadata: Metadata = {
  title: "공정 | CAPA Simulator",
};

export default function RecipeMasterPage() {
  return <ProcessHubClient />;
}
