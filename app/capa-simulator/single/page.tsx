import type { Metadata } from "next";
import { SingleSimulatorClient } from "./single-simulator-client";

export const metadata: Metadata = {
  title: "CAPA 시뮬레이터",
};

export default function SingleSimulatorPage() {
  return <SingleSimulatorClient />;
}
