import { z } from "zod";

export const OclConceptSchema = z
  .object({
    uuid: z.string(),
    names: z.array(z.object({ name: z.string() }).passthrough()).optional(),
  })
  .passthrough();

export const ExportManifestSchema = z.object({
  concepts: z.array(z.unknown()),
  mappings: z.array(z.unknown()),
});

export type ExportManifest = z.infer<typeof ExportManifestSchema>;
export type OclConcept = z.infer<typeof OclConceptSchema>;

export interface CascadeOptions {
  mapTypes?: string;
  returnMapTypes?: string;
  view?: string;
}

export interface CollectionReference {
  expression: string;
  cascade: string;
}
