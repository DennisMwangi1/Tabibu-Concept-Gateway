import { describe, expect, it } from "vitest";
import { computeCoreSplit } from "../src/packaging/closure.js";
import {
  mergeTabibuBundles,
  transformOclExportToTabibu,
} from "../src/bundles/transformOclExport.js";

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

describe("transformOclExportToTabibu", () => {
  it("maps OCL concepts to tabibu_schema shape", () => {
    const bundle = transformOclExportToTabibu(
      {
        concepts: [
          {
            uuid: "11111111-1111-1111-1111-111111111111",
            external_id: "11111111-1111-1111-1111-111111111111",
            url: "/orgs/LOINC/sources/LOINC/concepts/718-7/",
            concept_class: "LabTest",
            datatype: "Numeric",
            names: [{ name: "Haemoglobin", locale: "en", locale_preferred: true }],
            units: "g/dL",
          },
        ],
        mappings: [
          {
            from_concept_url: "/orgs/LOINC/sources/LOINC/concepts/718-7/",
            to_source_name: "LOINC",
            to_concept_code: "718-7",
            map_type: "SAME-AS",
          },
        ],
      },
      { id: "tabibu-lab", version: "v1.0.0" },
    );

    expect(bundle.concepts).toHaveLength(1);
    expect(bundle.concept_names[0].name).toBe("Haemoglobin");
    expect(bundle.concept_classes.map((c) => c.name)).toContain("LabTest");
    expect(bundle.concept_reference_maps[0].term_code).toBe("718-7");
  });

  it("merges bundles without duplicate concept uuids", () => {
    const a = transformOclExportToTabibu(
      {
        concepts: [{ uuid: "aaa", concept_class: "Test", datatype: "Text" }],
        mappings: [],
      },
      { id: "tabibu-core", version: "v1" },
    );
    const b = transformOclExportToTabibu(
      {
        concepts: [{ uuid: "bbb", concept_class: "Test", datatype: "Text" }],
        mappings: [],
      },
      { id: "tabibu-lab", version: "v1" },
    );

    const merged = mergeTabibuBundles([a, b]);
    expect(merged.concepts).toHaveLength(2);
    expect(merged.collections).toHaveLength(2);
  });
});
