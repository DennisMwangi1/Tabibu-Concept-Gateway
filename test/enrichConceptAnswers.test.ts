import { describe, expect, it, vi } from "vitest";
import { enrichConceptAnswersFromOcl } from "../src/bundles/enrichConceptAnswers.js";
import { transformOclExportToTabibu } from "../src/bundles/transformOclExport.js";
import * as qanda from "../src/ocl/qandaMappings.js";
import { oclClient } from "../src/ocl/client.js";

describe("enrichConceptAnswersFromOcl", () => {
  it("adds Q-AND-A rows for coded concepts missing from export mappings", async () => {
    vi.spyOn(qanda, "fetchQAndAMappings").mockResolvedValue([
      {
        map_type: "Q-AND-A",
        to_concept_url: "/orgs/CIEL/sources/CIEL/concepts/1065/",
        sort_weight: 1,
      },
      {
        map_type: "Q-AND-A",
        to_concept_url: "/orgs/CIEL/sources/CIEL/concepts/1066/",
        sort_weight: 2,
      },
    ]);

    vi.spyOn(oclClient, "get").mockImplementation(async (url: string) => {
      if (url.includes("/concepts/1065/")) {
        return {
          status: 200,
          data: {
            id: "1065",
            external_id: "1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            concept_class: "Misc",
            datatype: "N/A",
            url: "/orgs/CIEL/sources/CIEL/concepts/1065/",
            names: [{ name: "Yes", locale: "en", locale_preferred: true }],
          },
        };
      }
      if (url.includes("/concepts/1066/")) {
        return {
          status: 200,
          data: {
            id: "1066",
            external_id: "1066AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            concept_class: "Misc",
            datatype: "N/A",
            url: "/orgs/CIEL/sources/CIEL/concepts/1066/",
            names: [{ name: "No", locale: "en", locale_preferred: true }],
          },
        };
      }
      return { status: 404, data: {} };
    });

    const exportData = {
      concepts: [
        {
          id: "162092",
          external_id: "162092AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          concept_class: "Question",
          datatype: "Coded",
          url: "/orgs/CIEL/sources/CIEL/concepts/162092/",
          names: [{ name: "Blood loss", locale: "en" }],
        },
      ],
      mappings: [],
    };

    const bundle = transformOclExportToTabibu(exportData, {
      id: "tabibu-maternity",
      version: "v1.0.0",
    });
    expect(bundle.concept_answers).toHaveLength(0);

    await enrichConceptAnswersFromOcl(bundle, exportData);

    expect(bundle.concept_answers).toHaveLength(2);
    expect(bundle.concept_answers[0]).toMatchObject({
      concept_uuid: "162092AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      answer_concept_uuid: "1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      sort_weight: 1,
    });
    expect(bundle.concepts.map((c) => c.uuid)).toContain(
      "1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
  });
});

describe("transformOclExportToTabibu Q-AND-A mappings", () => {
  it("maps export Q-AND-A mappings when present", () => {
    const bundle = transformOclExportToTabibu(
      {
        concepts: [
          {
            id: "162092",
            external_id: "162092AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            concept_class: "Question",
            datatype: "Coded",
            url: "/orgs/CIEL/sources/CIEL/concepts/162092/",
          },
          {
            id: "1065",
            external_id: "1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            concept_class: "Misc",
            datatype: "N/A",
            url: "/orgs/CIEL/sources/CIEL/concepts/1065/",
          },
        ],
        mappings: [
          {
            map_type: "Q-AND-A",
            from_concept_url: "/orgs/CIEL/sources/CIEL/concepts/162092/",
            to_concept_url: "/orgs/CIEL/sources/CIEL/concepts/1065/",
            sort_weight: 1,
          },
        ],
      },
      { id: "tabibu-core", version: "v1.0.0" },
    );

    expect(bundle.concept_answers).toHaveLength(1);
    expect(bundle.concept_answers[0].answer_concept_uuid).toBe(
      "1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
  });
});
