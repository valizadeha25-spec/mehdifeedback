import { LandingShell } from "@/components/landing-shell";
import { getConfigurationState } from "@/lib/env";
import { providerCatalog } from "@/lib/providers";

export default function Home() {
  return (
    <LandingShell configuration={getConfigurationState()} providers={providerCatalog} />
  );
}
