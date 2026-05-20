import { CapaAccessGate } from "@/src/components/capa/capa-access-gate";

export default function CapaSimulatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CapaAccessGate>{children}</CapaAccessGate>;
}
