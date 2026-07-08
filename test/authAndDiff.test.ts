import { describe, expect, it } from "vitest";
import {
  generateHospitalApiKey,
  hashHospitalApiKey,
  verifyHospitalApiKey,
} from "../src/lib/hospitalApiKey.js";
import { computeConceptDiffs } from "../src/upgrades/diffReport.js";

describe("hospitalApiKey", () => {
  it("generates verifiable keys", () => {
    const key = generateHospitalApiKey();
    const hash = hashHospitalApiKey(key);
    expect(key.length).toBeGreaterThan(20);
    expect(verifyHospitalApiKey(key, hash)).toBe(true);
    expect(verifyHospitalApiKey("wrong-key", hash)).toBe(false);
  });
});

describe("computeConceptDiffs", () => {
  it("detects added, removed, and modified concepts", () => {
    const from = [
      {
        uuid: "a",
        names: [{ name: "Alpha" }],
        datatype: "Text",
        retired: false,
      },
      {
        uuid: "b",
        names: [{ name: "Beta" }],
        datatype: "Numeric",
        retired: false,
      },
    ];
    const to = [
      {
        uuid: "a",
        names: [{ name: "Alpha renamed" }],
        datatype: "Text",
        retired: false,
      },
      {
        uuid: "c",
        names: [{ name: "Gamma" }],
        datatype: "Coded",
        retired: false,
      },
    ];

    const diffs = computeConceptDiffs(from, to);
    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ concept_uuid: "a", change_type: "modified" }),
        expect.objectContaining({ concept_uuid: "b", change_type: "removed" }),
        expect.objectContaining({ concept_uuid: "c", change_type: "added" }),
      ]),
    );

    const modified = diffs.find((d) => d.concept_uuid === "a");
    expect(modified?.field_changes?.name).toEqual({
      old: "Alpha",
      new: "Alpha renamed",
    });
  });
});
