import type { Metadata } from "next";
import { RecipeMasterClient } from "../recipe-master/recipe-master-client";

export const metadata: Metadata = {
  title: "등록 | CAPA Simulator",
};

export default function SingleSimulatorPage() {
  return <RecipeMasterClient pageTitle="등록" />;
}
