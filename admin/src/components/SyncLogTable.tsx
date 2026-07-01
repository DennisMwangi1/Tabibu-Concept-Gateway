import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import type { SyncEvent } from "../lib/types";

const EVENT_CONFIG: Record<
  string,
  { icon: typeof CheckCircle2; color: string; label: string }
> = {
  bundle_requested: {
    icon: RefreshCw,
    color: "text-blue-500",
    label: "Bundle requested",
  },
  bundle_applied: {
    icon: CheckCircle2,
    color: "text-brand-600",
    label: "Bundle applied",
  },
  bundle_apply_failed: {
    icon: XCircle,
    color: "text-red-500",
    label: "Apply failed",
  },
};

interface Props {
  events: SyncEvent[];
}

export default function SyncLogTable({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-10 text-center">
        <p className="text-sm text-slate-400">No sync events yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
              Event
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
              Detail
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">
              Time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {events.map((event) => {
            const cfg = EVENT_CONFIG[event.event_type] ?? {
              icon: RefreshCw,
              color: "text-slate-400",
              label: event.event_type,
            };
            const Icon = cfg.icon;

            return (
              <tr key={event.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.color}`} />
                    <span className="font-medium text-slate-700">
                      {cfg.label}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                  {event.detail?.collections
                    ? `${(event.detail.collections as unknown[]).length} collections`
                    : event.detail?.failureReason
                      ? String(event.detail.failureReason)
                      : "—"}
                </td>
                <td className="px-4 py-3 text-right text-slate-400 text-xs whitespace-nowrap">
                  {new Date(event.created_at).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
