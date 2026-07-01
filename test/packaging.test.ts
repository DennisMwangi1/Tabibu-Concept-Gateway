import { describe, expect, it } from "vitest";
import { computeCoreSplit } from "../src/packaging/closure.js";

describe("computeCoreSplit", () => {
  it("puts concepts shared across modules into core", () => {
    const lab = new Set(["a", "b", "shared"]);
    const maternity = new Set(["c", "shared"]);
    const { core, moduleContent } = computeCoreSplit(
      new Map([
        ["lab", lab],
        ["maternity", maternity],
      ]),
    );

    expect(core.has("shared")).toBe(true);
    expect(moduleContent.get("lab")).toEqual(new Set(["a", "b"]));
    expect(moduleContent.get("maternity")).toEqual(new Set(["c"]));
  });
});

describe("health", () => {
  it("placeholder — integration tests require Supabase + OCL", () => {
    expect(true).toBe(true);
  });
});
