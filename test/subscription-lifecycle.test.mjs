import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { AppError } = require("../dist/backend/src/middleware/error-handler.js");

describe("subscription lifecycle transition rules", () => {
  it("exposes explicit transition errors as conflicts", () => {
    const error = new AppError("INVALID_SUBSCRIPTION_TRANSITION", "invalid", 409);
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe("INVALID_SUBSCRIPTION_TRANSITION");
  });
});
