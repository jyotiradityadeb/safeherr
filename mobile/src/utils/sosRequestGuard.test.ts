import { describe, expect, it } from "vitest";

import { createSosRequestGuard } from "./sosRequestGuard";

describe("SOS request guard", () => {
  it("allows exactly one trigger across repeated taps and timer completion", () => {
    const guard = createSosRequestGuard();

    expect(guard.claim()).toBe(true);
    expect(guard.claim()).toBe(false);
    expect(guard.claim()).toBe(false);
  });

  it("allows a retry only after an explicit release", () => {
    const guard = createSosRequestGuard();

    expect(guard.claim()).toBe(true);
    guard.release();
    expect(guard.claim()).toBe(true);
  });
});
