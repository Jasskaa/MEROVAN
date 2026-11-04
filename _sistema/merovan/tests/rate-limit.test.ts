import { describe, expect, it } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit inside the window and resets after it", () => {
    const t = 1_000_000;
    expect(rateLimit("k", 2, 1000, t).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, t + 10).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, t + 20).ok).toBe(false);
    expect(rateLimit("k", 2, 1000, t + 1000).ok).toBe(true);
  });

  it("keeps keys independent", () => {
    expect(rateLimit("a", 1, 1000, 0).ok).toBe(true);
    expect(rateLimit("b", 1, 1000, 0).ok).toBe(true);
  });
});
