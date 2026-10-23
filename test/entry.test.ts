import { describe, expect, it } from "vitest";
import * as entry from "../src/index";

// The Workers runtime refuses to start if the main module exports anything other than
// handlers (functions, or objects with handler methods). This caught a real bug once.
describe("worker entry module", () => {
  it("only exports handlers", () => {
    for (const [name, value] of Object.entries(entry)) {
      const ok = typeof value === "function" || (typeof value === "object" && value !== null && typeof (value as { fetch?: unknown }).fetch === "function");
      expect(ok, `export "${name}" must be a function or handler object`).toBe(true);
    }
  });
});
