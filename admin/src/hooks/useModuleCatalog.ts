import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useModuleCatalog() {
  return useQuery({
    queryKey: ["module-catalog"],
    queryFn: () => api.modules.catalog(),
    staleTime: 5 * 60_000,
  });
}
