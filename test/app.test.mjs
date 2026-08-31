import { createRequire } from "node:module";
import request from "supertest";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createApp } = require("../dist/backend/src/app.js");

describe("API foundation", () => {
  const app = createApp();

  it("responds from the operational health endpoint", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.body).toEqual({
      data: {
        status: "ok"
      }
    });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("mounts versioned API routes under /api/v1", async () => {
    const response = await request(app).get("/api/v1").expect(200);

    expect(response.body).toEqual({
      data: {
        name: "EduFlow API",
        version: "v1"
      }
    });
  });

  it("rejects the protected auth context without a session", async () => {
    const response = await request(app).get("/api/v1/auth-context").expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");

    const pipelineResponse = await request(app).get("/api/v1/access-pipeline-example").expect(401);
    expect(pipelineResponse.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects the protected workspace context without a session", async () => {
    const response = await request(app)
      .get("/api/v1/workspace-context")
      .set("X-Workspace-Id", "00000000-0000-4000-8000-000000000001")
      .expect(401);

    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
});
