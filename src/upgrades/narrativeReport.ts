import { env } from "../config/env.js";
import { getSupabase } from "../config/supabase.js";
import { NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { listConceptDiffsForRollout } from "./conceptDiffService.js";

function buildFallbackNarrative(
  collectionId: string,
  fromVersion: string | null,
  toVersion: string,
  diffs: Awaited<ReturnType<typeof listConceptDiffsForRollout>>,
): string {
  const added = diffs.filter((d) => d.change_type === "added").length;
  const removed = diffs.filter((d) => d.change_type === "removed").length;
  const modified = diffs.filter((d) => d.change_type === "modified").length;

  const notable = diffs
    .filter((d) => d.change_type === "modified" && d.field_changes)
    .slice(0, 5)
    .map((d) => {
      const fields = Object.keys(
        (d.field_changes ?? {}) as Record<string, unknown>,
      );
      return `- ${d.concept_uuid}: ${fields.join(", ")} changed`;
    });

  const lines = [
    `Upgrade report for ${collectionId}: ${fromVersion ?? "initial"} → ${toVersion}.`,
    "",
    `Summary: ${added} concept(s) added, ${removed} removed, ${modified} modified.`,
  ];

  if (notable.length > 0) {
    lines.push("", "Notable modifications:", ...notable);
  }

  return lines.join("\n");
}

async function generateLlmNarrative(
  collectionId: string,
  fromVersion: string | null,
  toVersion: string,
  diffs: Awaited<ReturnType<typeof listConceptDiffsForRollout>>,
): Promise<string> {
  const added = diffs.filter((d) => d.change_type === "added").length;
  const removed = diffs.filter((d) => d.change_type === "removed").length;
  const modified = diffs.filter((d) => d.change_type === "modified").length;

  const sample = diffs.slice(0, 50).map((d) => ({
    concept_uuid: d.concept_uuid,
    change_type: d.change_type,
    field_changes: d.field_changes,
  }));

  const prompt = `You are summarizing a medical concept dictionary upgrade for hospital administrators.

Collection: ${collectionId}
Version change: ${fromVersion ?? "none"} → ${toVersion}
Counts: ${added} added, ${removed} removed, ${modified} modified

Structured concept changes (sample):
${JSON.stringify(sample, null, 2)}

Write a concise 2-4 paragraph narrative explaining what changed and why it may matter clinically or operationally. Use plain language. Include the counts.`;

  const res = await fetch(env.LLM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("LLM returned empty narrative");
  return content;
}

export async function getOrGenerateNarrativeReport(
  hospitalId: string,
  rolloutId: number,
) {
  const supabase = getSupabase();

  const { data: rollout, error } = await supabase
    .from("concept_upgrade_rollouts")
    .select(
      "id, hospital_id, collection_id, from_version, to_version, narrative_summary",
    )
    .eq("id", rolloutId)
    .eq("hospital_id", hospitalId)
    .maybeSingle();

  if (error) throw error;
  if (!rollout) {
    throw new NotFoundError(`Rollout ${rolloutId} not found for hospital ${hospitalId}`);
  }

  if (rollout.narrative_summary) {
    return {
      rolloutId: rollout.id,
      collectionId: rollout.collection_id,
      fromVersion: rollout.from_version,
      toVersion: rollout.to_version,
      narrative: rollout.narrative_summary,
      cached: true,
    };
  }

  const diffs = await listConceptDiffsForRollout(rolloutId);

  let narrative: string;
  if (env.LLM_API_KEY) {
    try {
      narrative = await generateLlmNarrative(
        rollout.collection_id,
        rollout.from_version,
        rollout.to_version,
        diffs,
      );
    } catch (err) {
      logger.warn({ err, rolloutId }, "LLM narrative failed; using fallback");
      narrative = buildFallbackNarrative(
        rollout.collection_id,
        rollout.from_version,
        rollout.to_version,
        diffs,
      );
    }
  } else {
    narrative = buildFallbackNarrative(
      rollout.collection_id,
      rollout.from_version,
      rollout.to_version,
      diffs,
    );
  }

  const { error: cacheError } = await supabase
    .from("concept_upgrade_rollouts")
    .update({ narrative_summary: narrative })
    .eq("id", rolloutId);

  if (cacheError) throw cacheError;

  return {
    rolloutId: rollout.id,
    collectionId: rollout.collection_id,
    fromVersion: rollout.from_version,
    toVersion: rollout.to_version,
    narrative,
    cached: false,
  };
}
