import cron from "node-cron";
import { getSupabase } from "../config/supabase.js";
import { logger } from "../lib/logger.js";

/**
 * Periodically checks OCL for new released collection versions.
 * v1: logs collections missing latest_version; full auto-pin deferred.
 */
export function startOclReleasePolling() {
  cron.schedule("0 2 * * *", async () => {
    try {
      const supabase = getSupabase();
      const { data: collections, error } = await supabase
        .from("collections")
        .select("id, latest_version");

      if (error) {
        logger.error({ err: error }, "OCL release poll failed");
        return;
      }

      const pending = (collections ?? []).filter((c) => !c.latest_version);
      if (pending.length > 0) {
        logger.info(
          { collections: pending.map((c) => c.id) },
          "Collections without pinned latest_version",
        );
      }
    } catch (err) {
      logger.error({ err }, "OCL release poll error");
    }
  });

  logger.info("OCL release polling scheduled (daily at 02:00)");
}
