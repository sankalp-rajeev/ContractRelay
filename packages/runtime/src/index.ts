/** Exact identity required by the future promotion registry and runtime. */
export interface PromotionKey {
  oldContractHash: string;
  newContractHash: string;
  adapterPlanHash: string;
  policyVersion: string;
}

// No serving path exists until evidence gates and exact-hash promotion are implemented.
