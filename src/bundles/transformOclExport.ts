import { isQAndAMapType } from "../ocl/qandaMappings.js";
import type { ExportManifest } from "../ocl/types.js";
import type { TabibuConceptBundle } from "./tabibuSchema.js";
import { EMPTY_BUNDLE } from "./tabibuSchema.js";

type OclRecord = Record<string, unknown>;

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Transforms raw OCL collection export JSON into tabibu_schema-aligned tables.
 *
 * Key OCL export field notes:
 * - concept.uuid     = OCL internal integer ID ("12317732") — NOT the OpenMRS UUID
 * - concept.external_id = OpenMRS UUID ("159947AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
 * - concept.url      = OCL path ("/orgs/CIEL/sources/CIEL/concepts/159947/")
 * - mapping fields use from_concept_url / to_concept_url (paths), never UUID fields
 *
 * We use external_id as the stable concept identifier throughout the bundle
 * and build a url→uuid index to resolve mapping references.
 */
export function transformOclExportToTabibu(
  exportData: ExportManifest,
  collectionMeta: { id: string; version: string },
): TabibuConceptBundle {
  const bundle: TabibuConceptBundle = {
    ...structuredClone(EMPTY_BUNDLE),
    collections: [collectionMeta],
    generatedAt: new Date().toISOString(),
  };

  const classNames = new Set<string>();
  const datatypeNames = new Set<string>();
  const sourceNames = new Set<string>();

  // Build OCL concept URL → OpenMRS UUID lookup for mapping resolution.
  // OCL export mappings only carry from_concept_url / to_concept_url, not UUIDs.
  const urlToUuid = new Map<string, string>();

  for (const raw of exportData.concepts) {
    const c = raw as OclRecord;

    // Use external_id (OpenMRS UUID, e.g. "159947AAAAAA…") as our stable UUID.
    // Fall back to OCL's id field (the CIEL concept code, e.g. "159947") so we
    // always have a non-empty identifier even if external_id is absent.
    const uuid = str(c.external_id ?? c.id ?? c.uuid);
    if (!uuid) continue;

    // Map the concept's OCL URL to its UUID so mappings can be resolved.
    const conceptUrl = str(c.url);
    if (conceptUrl) urlToUuid.set(conceptUrl, uuid);

    const conceptClass = str(c.concept_class ?? c.class ?? "Misc");
    // is_set can be top-level or inside extras (OCL stores it in extras for CIEL)
    const extras = (c.extras ?? {}) as OclRecord;
    const isSet =
      bool(c.is_set) ||
      bool(extras.is_set) ||
      str(c.concept_class).toLowerCase().includes("convset");

    const datatype = str(c.datatype ?? c.data_type ?? "N/A");
    classNames.add(conceptClass);
    datatypeNames.add(datatype);

    bundle.concepts.push({
      uuid,
      concept_class: conceptClass,
      datatype,
      is_set: isSet,
      version: c.version != null ? str(c.version) : null,
      retired: bool(c.retired),
      retire_reason: c.retire_reason != null ? str(c.retire_reason) : null,
    });

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

    const descriptions = c.descriptions as OclRecord[] | undefined;
    for (const d of descriptions ?? []) {
      bundle.concept_descriptions.push({
        concept_uuid: uuid,
        description: str(d.description),
        locale: str(d.locale, "en"),
        voided: bool(d.voided),
      });
    }

    // Numeric ranges — check both top-level fields and extras (CIEL export style).
    const numSrc = (
      c.hi_absolute != null ||
      c.units != null ||
      c.low_normal != null ||
      extras.hi_absolute != null ||
      extras.units != null ||
      extras.low_normal != null
    )
      ? { ...extras, ...c }
      : null;

    if (numSrc) {
      bundle.concept_numerics.push({
        concept_uuid: uuid,
        hi_absolute: numOrNull(numSrc.hi_absolute),
        hi_critical: numOrNull(numSrc.hi_critical),
        hi_normal: numOrNull(numSrc.hi_normal),
        low_normal: numOrNull(numSrc.low_normal),
        low_critical: numOrNull(numSrc.low_critical),
        low_absolute: numOrNull(numSrc.low_absolute),
        units: numSrc.units != null ? str(numSrc.units) : null,
        allow_decimal: bool(numSrc.allow_decimal, true),
        display_precision: numOrNull(numSrc.display_precision),
      });
    }

    // concept_answers / concept_sets may be embedded on the concept (OpenMRS
    // style). Standard OCL versioned exports deliver them via the top-level
    // mappings array instead — handled in the pass below.
    const answers = c.answers as OclRecord[] | undefined;
    for (const [i, a] of (answers ?? []).entries()) {
      const answerUuid = str(a.external_id ?? a.uuid ?? a.answer_concept ?? a.concept);
      if (!answerUuid) continue;
      bundle.concept_answers.push({
        concept_uuid: uuid,
        answer_concept_uuid: answerUuid,
        sort_weight: numOrNull(a.sort_weight) ?? i,
      });
    }

    const setMembers = c.set_members as OclRecord[] | undefined;
    for (const [i, m] of (setMembers ?? []).entries()) {
      const memberUuid = str(m.external_id ?? m.uuid ?? m.member_concept);
      if (!memberUuid) continue;
      bundle.concept_sets.push({
        set_concept_uuid: uuid,
        member_concept_uuid: memberUuid,
        sort_weight: numOrNull(m.sort_weight) ?? i,
      });
    }
  }

  // Track seen pairs so embedded + mapping paths don't duplicate.
  const seenAnswers = new Set(
    bundle.concept_answers.map((a) => `${a.concept_uuid}:${a.answer_concept_uuid}`),
  );
  const seenSets = new Set(
    bundle.concept_sets.map((s) => `${s.set_concept_uuid}:${s.member_concept_uuid}`),
  );

  for (const raw of exportData.mappings) {
    const m = raw as OclRecord;

    if (bool(m.retired)) continue;

    // OCL mapping exports use from_concept_url / to_concept_url (URL paths).
    // There are no from_concept_uuid / to_concept_uuid fields in the OCL export.
    const rawMapType = str(m.map_type ?? m.mapType ?? "");
    const fromUrl = str(m.from_concept_url ?? m.fromConceptUrl);
    const toUrl = str(m.to_concept_url ?? m.toConceptUrl);

    // Resolve URL → OpenMRS UUID using the index built from the concepts pass.
    const fromUuid = fromUrl ? (urlToUuid.get(fromUrl) ?? "") : "";
    if (!fromUuid) continue;

    if (isQAndAMapType(rawMapType)) {
      const toUuid = toUrl ? (urlToUuid.get(toUrl) ?? "") : "";
      if (!toUuid) continue;
      const key = `${fromUuid}:${toUuid}`;
      if (seenAnswers.has(key)) continue;
      seenAnswers.add(key);
      bundle.concept_answers.push({
        concept_uuid: fromUuid,
        answer_concept_uuid: toUuid,
        sort_weight: numOrNull(m.sort_weight) ?? bundle.concept_answers.length,
      });
      continue;
    }

    if (rawMapType.toUpperCase().replace(/\s+/g, "-") === "CONCEPT-SET") {
      const toUuid = toUrl ? (urlToUuid.get(toUrl) ?? "") : "";
      if (!toUuid) continue;
      const key = `${fromUuid}:${toUuid}`;
      if (seenSets.has(key)) continue;
      seenSets.add(key);
      bundle.concept_sets.push({
        set_concept_uuid: fromUuid,
        member_concept_uuid: toUuid,
        sort_weight: numOrNull(m.sort_weight) ?? bundle.concept_sets.length,
      });
      continue;
    }

    // All other map types (SAME-AS, NARROWER-THAN, etc.) are external
    // code-system references (ICD-10, SNOMED, LOINC, …).
    // Use to_source_name as a stable short identifier; fall back to the URL.
    const sourceName = str(
      m.to_source_name ?? m.toSourceName ?? m.to_source_url ?? m.toSourceUrl,
    );
    const termCode = str(m.to_concept_code ?? m.toConceptCode);

    if (sourceName && termCode) {
      sourceNames.add(sourceName);
      bundle.concept_reference_maps.push({
        concept_uuid: fromUuid,
        source_name: sourceName,
        term_code: termCode,
        map_type: normalizeMapType(rawMapType),
      });
      bundle.concept_reference_terms.push({
        source_name: sourceName,
        code: termCode,
        name: m.to_concept_name != null ? str(m.to_concept_name) : null,
        retired: bool(m.retired),
      });
    }
  }

  bundle.concept_classes = [...classNames].map((name) => ({ name }));
  bundle.concept_datatypes = [...datatypeNames].map((name) => ({ name }));
  bundle.concept_reference_sources = [...sourceNames].map((name) => ({ name }));

  return bundle;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeMapType(v: unknown): "SAME-AS" | "NARROWER-THAN" | "BROADER-THAN" {
  const s = str(v, "SAME-AS").toUpperCase().replace(/\s+/g, "-");
  if (s === "NARROWER-THAN" || s === "BROADER-THAN") return s;
  return "SAME-AS";
}

/** Merge multiple collection bundles; later entries win on UUID conflicts. */
export function mergeTabibuBundles(bundles: TabibuConceptBundle[]): TabibuConceptBundle {
  if (bundles.length === 0) return { ...EMPTY_BUNDLE, generatedAt: new Date().toISOString() };

  const merged: TabibuConceptBundle = {
    schemaVersion: "1",
    collections: bundles.flatMap((b) => b.collections),
    concept_classes: dedupeByKey(bundles.flatMap((b) => b.concept_classes), (c) => c.name),
    concept_datatypes: dedupeByKey(bundles.flatMap((b) => b.concept_datatypes), (d) => d.name),
    concept_reference_sources: dedupeByKey(
      bundles.flatMap((b) => b.concept_reference_sources),
      (s) => s.name,
    ),
    concepts: dedupeByKey(bundles.flatMap((b) => b.concepts), (c) => c.uuid),
    concept_names: bundles.flatMap((b) => b.concept_names),
    concept_descriptions: bundles.flatMap((b) => b.concept_descriptions),
    concept_numerics: dedupeByKey(bundles.flatMap((b) => b.concept_numerics), (n) => n.concept_uuid),
    concept_answers: bundles.flatMap((b) => b.concept_answers),
    concept_sets: bundles.flatMap((b) => b.concept_sets),
    concept_reference_terms: dedupeByKey(
      bundles.flatMap((b) => b.concept_reference_terms),
      (t) => `${t.source_name}:${t.code}`,
    ),
    concept_reference_maps: dedupeByKey(
      bundles.flatMap((b) => b.concept_reference_maps),
      (m) => `${m.concept_uuid}:${m.source_name}:${m.term_code}:${m.map_type ?? "SAME-AS"}`,
    ),
    generatedAt: new Date().toISOString(),
  };

  return merged;
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(keyFn(item), item);
  }
  return [...map.values()];
}
