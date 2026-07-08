/**
 * Bundle shape aligned with Tabibu-Server/tabibu_schema.sql concept_* tables.
 *
 * Hospital sync client upserts by UUID in this order:
 *   1. concept_classes, concept_datatypes (seed if absent)
 *   2. concept_reference_sources
 *   3. concepts
 *   4. concept_names, concept_descriptions, concept_numerics
 *   5. concept_answers, concept_sets
 *   6. concept_reference_terms, concept_reference_maps
 */
export interface TabibuConceptClass {
  name: string;
  description?: string | null;
  retired?: boolean;
}

export interface TabibuConceptDatatype {
  name: string;
}

export interface TabibuConcept {
  uuid: string;
  concept_class: string;
  datatype: string;
  is_set?: boolean;
  version?: string | null;
  retired?: boolean;
  retire_reason?: string | null;
}

export interface TabibuConceptName {
  concept_uuid: string;
  name: string;
  locale?: string;
  locale_preferred?: boolean;
  name_type?: string | null;
  voided?: boolean;
}

export interface TabibuConceptDescription {
  concept_uuid: string;
  description: string;
  locale?: string;
  voided?: boolean;
}

export interface TabibuConceptAnswer {
  concept_uuid: string;
  answer_concept_uuid: string;
  sort_weight?: number;
}

export interface TabibuConceptSet {
  set_concept_uuid: string;
  member_concept_uuid: string;
  sort_weight?: number;
}

/** Which OCL collection(s) a concept was sourced from — a concept shared
 * across modules (promoted to tabibu-core) has one row per collection. */
export interface TabibuConceptCollection {
  concept_uuid: string;
  collection_id: string;
}

export interface TabibuConceptNumeric {
  concept_uuid: string;
  hi_absolute?: number | null;
  hi_critical?: number | null;
  hi_normal?: number | null;
  low_normal?: number | null;
  low_critical?: number | null;
  low_absolute?: number | null;
  units?: string | null;
  allow_decimal?: boolean;
  display_precision?: number | null;
}

export interface TabibuConceptReferenceSource {
  name: string;
  description?: string | null;
  fhir_system_uri?: string | null;
  retired?: boolean;
}

export interface TabibuConceptReferenceTerm {
  source_name: string;
  code: string;
  name?: string | null;
  retired?: boolean;
}

export type TabibuMapType = "SAME-AS" | "NARROWER-THAN" | "BROADER-THAN";

export interface TabibuConceptReferenceMap {
  concept_uuid: string;
  source_name: string;
  term_code: string;
  map_type?: TabibuMapType;
}

/** Full bundle returned to hospital sync clients. */
export interface TabibuConceptBundle {
  schemaVersion: "1";
  collections: Array<{ id: string; version: string }>;
  concept_classes: TabibuConceptClass[];
  concept_datatypes: TabibuConceptDatatype[];
  concept_reference_sources: TabibuConceptReferenceSource[];
  concepts: TabibuConcept[];
  concept_names: TabibuConceptName[];
  concept_descriptions: TabibuConceptDescription[];
  concept_numerics: TabibuConceptNumeric[];
  concept_answers: TabibuConceptAnswer[];
  concept_sets: TabibuConceptSet[];
  concept_reference_terms: TabibuConceptReferenceTerm[];
  concept_reference_maps: TabibuConceptReferenceMap[];
  concept_collections: TabibuConceptCollection[];
  generatedAt: string;
}

export const EMPTY_BUNDLE: TabibuConceptBundle = {
  schemaVersion: "1",
  collections: [],
  concept_classes: [],
  concept_datatypes: [],
  concept_reference_sources: [],
  concepts: [],
  concept_names: [],
  concept_descriptions: [],
  concept_numerics: [],
  concept_answers: [],
  concept_sets: [],
  concept_reference_terms: [],
  concept_reference_maps: [],
  concept_collections: [],
  generatedAt: new Date(0).toISOString(),
};
