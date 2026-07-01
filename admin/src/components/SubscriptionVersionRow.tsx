import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GitBranch } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import type { CollectionSubscription } from "../lib/types";
import CollectionVersionSelect from "./CollectionVersionSelect";

interface Props {
  hospitalId: string;
  subscription: CollectionSubscription;
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v.replace(/^v/i, "").split(".").map((p) => Number.parseInt(p, 10) || 0);
  const aParts = parse(a);
  const bParts = parse(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export default function SubscriptionVersionRow({
  hospitalId,
  subscription,
}: Props) {
  const [targetVersion, setTargetVersion] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (toVersion: string) =>
      api.hospitals.upgrade(hospitalId, {
        collectionId: subscription.collection_id,
        toVersion,
        triggeredBy: "admin-ui",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospital", hospitalId] });
      queryClient.invalidateQueries({ queryKey: ["reports", hospitalId] });
      setTargetVersion("");
    },
  });

  const action = useMemo(() => {
    if (!targetVersion || !subscription.pinned_version) return null;
    const cmp = compareVersions(targetVersion, subscription.pinned_version);
    if (cmp > 0) return "upgrade" as const;
    if (cmp < 0) return "rollback" as const;
    return null;
  }, [targetVersion, subscription.pinned_version]);

  const canApply =
    !!targetVersion &&
    targetVersion !== subscription.pinned_version &&
    !mutation.isPending;

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-800">
            {subscription.collection_id}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {subscription.auto_derived ? "Auto-derived" : "Manual"}
            {subscription.subscribed_at
              ? ` · Subscribed ${new Date(subscription.subscribed_at).toLocaleDateString()}`
              : ""}
          </p>
        </div>
        {subscription.pinned_version ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 shrink-0">
            <GitBranch className="h-3 w-3" />
            {subscription.pinned_version}
          </span>
        ) : (
          <span className="text-xs text-slate-400 shrink-0">No version pinned</span>
        )}
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Target version
          </label>
          <CollectionVersionSelect
            collectionId={subscription.collection_id}
            value={targetVersion}
            onChange={setTargetVersion}
            pinnedVersion={subscription.pinned_version}
          />
        </div>
        <button
          onClick={() => canApply && mutation.mutate(targetVersion)}
          disabled={!canApply}
          className={`inline-flex items-center gap-1.5 rounded-lg ${action === "rollback" ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"} ${canApply ? "text-white" : "text-slate-400"} px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0`}
        >
          {action === "rollback" ? (
            <ArrowDown className="h-3.5 w-3.5" />
          ) : (
            <ArrowUp className="h-3.5 w-3.5" />
          )}
          {mutation.isPending
            ? "Queuing…"
            : action === "rollback"
              ? "Rollback"
              : "Upgrade"}
        </button>
      </div>

      {mutation.isError && (
        <p className="text-xs text-red-600">
          {(mutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
