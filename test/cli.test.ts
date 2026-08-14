import { describe, expect, it, vi } from "vitest";
import { run } from "../src/cli.js";

describe("run", () => {
  it("prints status message and returns exit code 0", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = run();

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Vibe Security Scanner"));

    logSpy.mockRestore();
  });
});
