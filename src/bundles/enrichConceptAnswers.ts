import type { ExportManifest } from "../ocl/types.js";
import { fetchQAndAMappings, parseConceptUrl } from "../ocl/qandaMappings.js";
import { oclClient } from "../ocl/client.js";
import type { TabibuConceptBundle } from "./tabibuSchema.js";

type OclRecord = Record<string, unknown>;

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function isCodedConcept(c: OclRecord): boolean {
  return str(c.datatype ?? c.data_type).toLowerCase() === "coded";
}

function conceptUuid(c: OclRecord): string {
  return str(c.external_id ?? c.id ?? c.uuid);
}

/**
 * OCL collection exports often omit Q-AND-A mappings even when coded questions
 * are present. Fetch answer relationships from the source API and ensure
 * answer concepts exist in the bundle.
 */
export async function enrichConceptAnswersFromOcl(
  bundle: TabibuConceptBundle,
  exportData: ExportManifest,
): Promise<void> {
  const knownUuids = new Set(bundle.concepts.map((c) => c.uuid));
  const urlToUuid = new Map<string, string>();
  for (const raw of exportData.concepts) {
    const c = raw as OclRecord;
    const uuid = conceptUuid(c);
    const url = str(c.url);
    if (uuid && url) urlToUuid.set(url, uuid);
  }

  const seen = new Set(
    bundle.concept_answers.map((a) => `${a.concept_uuid}:${a.answer_concept_uuid}`),
  );

  for (const raw of exportData.concepts) {
    const c = raw as OclRecord;
    if (!isCodedConcept(c)) continue;

    const fromUuid = conceptUuid(c);
    const parsed = parseConceptUrl(str(c.url));
    if (!fromUuid || !parsed) continue;

    const mappings = await fetchQAndAMappings(
      parsed.org,
      parsed.source,
      parsed.conceptId,
    );

    for (const [i, m] of mappings.entries()) {
      const toUrl = str(m.to_concept_url);
      if (!toUrl) continue;

      let toUuid = urlToUuid.get(toUrl) ?? "";
      if (!toUuid) {
        toUuid = await ensureAnswerConceptInBundle(bundle, toUrl, knownUuids, urlToUuid);
      }
      if (!toUuid) continue;

      const key = `${fromUuid}:${toUuid}`;
      if (seen.has(key)) continue;
      seen.add(key);

      bundle.concept_answers.push({
        concept_uuid: fromUuid,
        answer_concept_uuid: toUuid,
        sort_weight:
          m.sort_weight != null && Number.isFinite(Number(m.sort_weight))
            ? Number(m.sort_weight)
            : i,
      });
    }
  }
}

async function ensureAnswerConceptInBundle(
  bundle: TabibuConceptBundle,
  conceptUrl: string,
  knownUuids: Set<string>,
  urlToUuid: Map<string, string>,
): Promise<string> {
  const res = await oclClient.get(conceptUrl);
  if (res.status !== 200) return "";

  const c = res.data as OclRecord;
  const uuid = conceptUuid(c);
  if (!uuid) return "";

  urlToUuid.set(conceptUrl, uuid);

  if (!knownUuids.has(uuid)) {
    const extras = (c.extras ?? {}) as OclRecord;
    const conceptClass = str(c.concept_class ?? c.class ?? "Misc");
    const datatype = str(c.datatype ?? c.data_type ?? "N/A");
    const isSet =
      bool(c.is_set) ||
      bool(extras.is_set) ||
      str(c.concept_class).toLowerCase().includes("convset");

    bundle.concepts.push({
      uuid,
      concept_class: conceptClass,
      datatype,
      is_set: isSet,
      version: c.version != null ? str(c.version) : null,
      retired: bool(c.retired),
      retire_reason: c.retire_reason != null ? str(c.retire_reason) : null,
    });

    bundle.concept_collections.push({
      concept_uuid: uuid,
      collection_id: bundle.collections[0].id,
    });

    if (!bundle.concept_classes.some((x) => x.name === conceptClass)) {
      bundle.concept_classes.push({ name: conceptClass });
    }
    if (!bundle.concept_datatypes.some((x) => x.name === datatype)) {
      bundle.concept_datatypes.push({ name: datatype });
    }

    const names = (c.names ?? c.display_names) as OclRecord[] | undefined;
    for (const n of names ?? []) {
      if (str(n.locale, "en") !== "en") continue;
      bundle.concept_names.push({
        concept_uuid: uuid,
        name: str(n.name ?? n.display_name),
        locale: "en",
        locale_preferred: bool(n.locale_preferred ?? n.localePreferred),
        name_type: n.name_type != null ? str(n.name_type) : null,
        voided: bool(n.voided),
      });
    }

    knownUuids.add(uuid);
  }

  return uuid;
}
