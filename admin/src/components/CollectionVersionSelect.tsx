import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Props {
  collectionId: string;
  value: string;
  onChange: (version: string) => void;
  pinnedVersion?: string | null;
  disabled?: boolean;
  className?: string;
}

export default function CollectionVersionSelect({
  collectionId,
  value,
  onChange,
  pinnedVersion,
  disabled,
  className = "",
}: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["collection-versions", collectionId],
    queryFn: () => api.collections.versions(collectionId),
    enabled: !!collectionId,
  });

  const versions = data?.versions ?? [];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || isLoading || !collectionId}
      className={
        className ||
        "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
      }
    >
      <option value="">
        {isLoading
          ? "Loading versions…"
          : isError
            ? "Failed to load versions"
            : versions.length === 0
              ? "No versions available"
              : "Select version…"}
      </option>
      {versions.map((v) => (
        <option key={v.version} value={v.version}>
          {v.version}
          {v.version === pinnedVersion ? " (current)" : ""}
        </option>
      ))}
    </select>
  );
}
