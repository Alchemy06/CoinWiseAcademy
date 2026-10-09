import { CryptoMarketStructureModule } from "../components/market/CryptoMarketStructureModule";

export function CryptoMarketStructurePage() {
  // Keep the route component intentionally thin so page-level tests can focus on the module behavior directly.
  return <CryptoMarketStructureModule />;
}
