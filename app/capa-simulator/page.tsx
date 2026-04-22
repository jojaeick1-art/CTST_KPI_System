import type { Metadata } from "next";
import { CapaSimulatorClient } from "./capa-simulator-client";

export const metadata: Metadata = {
  title: "CAPA Simulator",
  description: "CTST 통합 시스템 — CAPA 시뮬레이터",
};

export default function CapaSimulatorPage() {
  return <CapaSimulatorClient />;
}
