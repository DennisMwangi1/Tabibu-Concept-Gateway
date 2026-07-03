import { useModuleCatalog } from "../hooks/useModuleCatalog";

const FALLBACK_CHIP =
  "bg-slate-50 text-slate-600 ring-1 ring-slate-200";

interface Props {
  module: string;
  size?: "sm" | "md";
}

export default function ModuleChip({ module, size = "md" }: Props) {
  const { data: catalog } = useModuleCatalog();

  const known = catalog?.modules.find((m) => m.app_module === module);
  const label = known?.label ?? module;
  const color = known?.chip_color ?? FALLBACK_CHIP;

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${color} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      {label}
    </span>
  );
}
