import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "EduFlow API listening");
});

process.on("SIGTERM", () => {
  server.close(() => {
    logger.info("EduFlow API stopped");
  });
});
