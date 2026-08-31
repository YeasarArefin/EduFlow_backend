import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { deriveSubscriptionAccessState } = require("../dist/backend/src/services/subscription-access.js");
const now = new Date("2026-08-31T00:00:00.000Z");

describe("subscription access state", () => {
  it.each([
    [
      "trial",
      {
        status: "trial",
        startsAt: null,
        expiresAt: null,
        trialEndsAt: new Date("2026-09-01T00:00:00.000Z")
      }
    ],
    [
      "active",
      {
        status: "active",
        startsAt: new Date("2026-08-01T00:00:00.000Z"),
        expiresAt: new Date("2026-09-30T00:00:00.000Z"),
        trialEndsAt: null
      }
    ],
    [
      "renewal due",
      {
        status: "renewal_due",
        startsAt: null,
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
        trialEndsAt: null
      }
    ]
  ])("allows %s subscriptions", (_name, subscription) => {
    expect(
      deriveSubscriptionAccessState({
        workspaceStatus: "active",
        subscription,
        now
      })
    ).toMatchObject({ allowed: true, status: subscription.status });
  });

  it("blocks an expired subscription by status and date", () => {
    expect(
      deriveSubscriptionAccessState({
        workspaceStatus: "active",
        subscription: {
          status: "expired",
          startsAt: null,
          expiresAt: null,
          trialEndsAt: null
        },
        now
      })
    ).toMatchObject({ allowed: false, status: "subscription_expired" });
    expect(
      deriveSubscriptionAccessState({
        workspaceStatus: "active",
        subscription: {
          status: "active",
          startsAt: null,
          expiresAt: new Date("2026-08-30T00:00:00.000Z"),
          trialEndsAt: null
        },
        now
      })
    ).toMatchObject({ allowed: false, status: "subscription_expired" });
  });

  it.each([
    ["locked", "locked"],
    ["suspended", "suspended"],
    ["scheduled for deletion", "scheduled_for_deletion"]
  ])("blocks a workspace that is %s", (_name, status) => {
    expect(
      deriveSubscriptionAccessState({
        workspaceStatus: status === "scheduled_for_deletion" ? "scheduled_deletion" : status,
        subscription: null,
        now
      })
    ).toMatchObject({ allowed: false, status });
  });

  it("reports missing subscription as payment pending", () => {
    expect(
      deriveSubscriptionAccessState({
        workspaceStatus: "active",
        subscription: null,
        now
      })
    ).toEqual({
      allowed: false,
      status: "payment_pending",
      reason: "No current subscription was found."
    });
  });
});
