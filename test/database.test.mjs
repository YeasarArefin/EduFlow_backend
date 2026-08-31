import { createRequire } from "node:module";
import { afterAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { env } = require("../dist/backend/src/config/env.js");
const { checkDatabaseConnection, pool } = require("../dist/backend/src/database/client.js");

describe("PostgreSQL connectivity", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("connects through Drizzle and executes a query", async () => {
    await expect(checkDatabaseConnection()).resolves.toBe(true);
  });
});
