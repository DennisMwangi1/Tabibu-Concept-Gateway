/** Strip leading "v" and split into numeric segments for comparison. */
function parseSegments(version: string): number[] {
  return stripVersionPrefix(version)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** Strip optional leading v/V for parsing (e.g. "v1.0.4" → "1.0.4"). */
export function stripVersionPrefix(version: string): string {
  return version.trim().replace(/^v/i, "");
}

/** Normalise to v-prefixed semver for OCL releases and Supabase storage. */
export function formatVersion(version: string): string {
  const stripped = stripVersionPrefix(version);
  if (!/^\d+\.\d+\.\d+$/.test(stripped)) {
    throw new Error(
      `Invalid semver: "${version}". Expected MAJOR.MINOR.PATCH (optional v prefix).`,
    );
  }
  return `v${stripped}`;
}

export type SemverBump = "major" | "minor" | "patch";

/** Bump a semver string; accepts and returns v-prefixed versions. */
export function bumpVersion(version: string, bump: SemverBump): string {
  const stripped = stripVersionPrefix(version);
  const match = stripped.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(
      `Invalid semver: "${version}". Expected MAJOR.MINOR.PATCH (optional v prefix).`,
    );
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (bump === "major") {
    major++;
    minor = 0;
    patch = 0;
  } else if (bump === "minor") {
    minor++;
    patch = 0;
  } else {
    patch++;
  }
  return `v${major}.${minor}.${patch}`;
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
