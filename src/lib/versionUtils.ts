/** Strip leading "v" and split into numeric segments for comparison. */
function parseSegments(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** Compare semver-style versions (e.g. v1.0.2). Returns negative if a < b. */
export function compareVersions(a: string, b: string): number {
  const aParts = parseSegments(a);
  const bParts = parseSegments(b);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function sortVersionsAsc(versions: string[]): string[] {
  return [...versions].sort(compareVersions);
}

/** Next version strictly after `pinned`, or the highest if pinned is null. */
export function nextVersionAfter(
  pinned: string | null,
  versions: string[],
): string | null {
  if (versions.length === 0) return null;

  const sorted = sortVersionsAsc(versions);
  if (!pinned) return sorted[sorted.length - 1] ?? null;

  for (const version of sorted) {
    if (compareVersions(version, pinned) > 0) return version;
  }
  return null;
}
