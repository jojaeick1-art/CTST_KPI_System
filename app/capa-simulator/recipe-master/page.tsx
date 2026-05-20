import type { Metadata } from "next";
import { RecipeMasterClient } from "./recipe-master-client";

export const metadata: Metadata = {
  title: "레시피 마스터 | CAPA Simulator",
};

export default function RecipeMasterPage() {
  return <RecipeMasterClient />;
}
