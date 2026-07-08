import { describe, expect, it } from "vitest";
import { parseBundleAppliedBody } from "../src/lib/bundleApplied.js";

describe("parseBundleAppliedBody", () => {
  it("defaults to success when only collections are sent", () => {
    const result = parseBundleAppliedBody({
      collections: [{ id: "tabibu-core", version: "v1.0.2" }],
    });
    expect(result.success).toBe(true);
    expect(result.collections).toEqual([
      { id: "tabibu-core", version: "v1.0.2" },
    ]);
  });

  it("treats explicit success=false as failure", () => {
    const result = parseBundleAppliedBody({
      success: false,
      failureReason: "DB constraint",
    });
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("DB constraint");
  });

  it("accepts snake_case failure_reason", () => {
    const result = parseBundleAppliedBody({
      failure_reason: "timeout",
    });
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("timeout");
  });

  it("normalizes collection_id field names", () => {
    const result = parseBundleAppliedBody({
      collections: [{ collection_id: "tabibu-lab", pinned_version: "v1.0.1" }],
    });
    expect(result.collections).toEqual([
      { id: "tabibu-lab", version: "v1.0.1" },
    ]);
  });
});
