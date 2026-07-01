import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3100),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /** Required for packaging CI and any admin write that bypasses RLS. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  // Default to the OCL public instance. Override with a self-hosted URL when needed.
  OCL_BASE_URL: z.string().url().default("https://api.openconceptlab.org"),
  // Optional for reading public collections; required for authoring/curation writes.
  OCL_API_TOKEN: z.string().min(1).optional(),
  OCL_ORG: z.string().default("Tabibu"),
  BUNDLE_CACHE_DIR: z.string().default("./.cache/bundles"),
  OPS_API_KEY: z.string().min(1),
  ADMIN_API_KEY: z.string().min(1),
  /** Comma-separated browser origins allowed to call admin/ops endpoints. */
  ADMIN_CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
