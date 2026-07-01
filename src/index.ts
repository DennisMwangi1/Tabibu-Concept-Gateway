import { fileURLToPath } from "node:url";
import express from "express";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { corsMiddleware } from "./middleware/cors.js";
import { startOclReleasePolling } from "./jobs/pollOclReleases.js";
import { adminRoutes } from "./routes/adminRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { hospitalRoutes } from "./routes/hospitalRoutes.js";
import { opsRoutes } from "./routes/opsRoutes.js";

export function createApp() {
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(pinoHttp({ logger }));

  app.use(healthRoutes);
  app.use(hospitalRoutes);
  app.use(adminRoutes);
  app.use(opsRoutes);

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof AppError) {
        return res.status(err.statusCode).json({
          error: err.message,
          code: err.code,
        });
      }

      logger.error({ err }, "Unhandled error");
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}

export function startServer() {
  const app = createApp();

  if (env.NODE_ENV !== "test") {
    startOclReleasePolling();
  }

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Tabibu Concept Gateway listening");
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
