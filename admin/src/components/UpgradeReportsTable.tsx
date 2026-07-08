import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import type { UpgradeReport } from "../lib/types";

interface ConceptSummary {
  uuid: string;
  name: string;
}

function asConcepts(value: unknown[]): ConceptSummary[] {
  return value.map((item) => {
    const c = item as Record<string, unknown>;
    return {
      uuid: String(c.uuid ?? ""),
      name: String(c.name ?? c.uuid ?? "Unknown"),
    };
  });
}

function NarrativePanel({
  hospitalId,
  rolloutId,
}: {
  hospitalId: string;
  rolloutId: number;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["narrative", hospitalId, rolloutId],
    queryFn: () => api.hospitals.narrativeReport(hospitalId, rolloutId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Generating narrative…
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-red-600">{(error as Error).message}</p>
    );
  }

  return (
    <div className="space-y-2">
      {data?.cached === false && (
        <p className="text-[11px] text-brand-600">Freshly generated</p>
      )}
      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
        {data?.narrative}
      </p>
    </div>
  );
}

function ReportRow({
  hospitalId,
  report,
}: {
  hospitalId: string;
  report: UpgradeReport;
}) {
  const [open, setOpen] = useState(false);
  const [showNarrative, setShowNarrative] = useState(false);
  const changed = asConcepts(report.changed_concepts);
  const retired = asConcepts(report.retired_concepts);
  const hasDetail = changed.length > 0 || retired.length > 0;

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3">
          {hasDetail ? (
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-1.5 text-left text-slate-700 hover:text-slate-900"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
              )}
              <span className="font-medium">{report.collection_id}</span>
            </button>
          ) : (
            <span className="font-medium text-slate-700 pl-5">
              {report.collection_id}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-slate-600">
          <span className="font-mono text-xs">
            {report.from_version ?? "none"} → {report.to_version}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-600 tabular-nums">
          {changed.length}
        </td>
        <td className="px-4 py-3 text-slate-600 tabular-nums">
          {retired.length}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={() => setShowNarrative(!showNarrative)}
            className="text-xs text-brand-600 hover:text-brand-700"
          >
            {showNarrative ? "Hide summary" : "View summary"}
          </button>
        </td>
        <td className="px-4 py-3 text-right text-slate-400 text-xs whitespace-nowrap">
          {new Date(report.generated_at).toLocaleString()}
        </td>
      </tr>
      {(open && hasDetail) || showNarrative ? (
        <tr>
          <td colSpan={6} className="px-4 py-4 bg-slate-50 border-t border-slate-100">
            {showNarrative && (
              <div className="mb-4 pl-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Narrative summary
                </p>
                <NarrativePanel
                  hospitalId={hospitalId}
                  rolloutId={report.rollout_id}
                />
              </div>
            )}
            {open && hasDetail && (
              <div className="grid gap-4 sm:grid-cols-2 pl-5">
                {changed.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Changed ({changed.length})
                    </p>
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {changed.map((c) => (
                        <li
                          key={c.uuid}
                          className="text-xs text-slate-700 truncate"
                          title={c.uuid}
                        >
                          {c.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {retired.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Retired ({retired.length})
                    </p>
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {retired.map((c) => (
                        <li
                          key={c.uuid}
                          className="text-xs text-red-700 truncate"
                          title={c.uuid}
                        >
                          {c.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

interface Props {
  hospitalId: string;
  reports: UpgradeReport[];
  isLoading?: boolean;
}

export default function UpgradeReportsTable({
  hospitalId,
  reports,
  isLoading,
}: Props) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-10 text-center">
        <p className="text-sm text-slate-400">Loading reports…</p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-10 text-center">
        <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No upgrade reports yet</p>
        <p className="text-xs text-slate-400 mt-1">
          Reports are generated when you upgrade or rollback a collection version
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
              Collection
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
              Version change
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
              Changed
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
              Retired
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">
              Summary
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">
              Generated
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reports.map((report) => (
            <ReportRow
              key={report.id}
              hospitalId={hospitalId}
              report={report}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
