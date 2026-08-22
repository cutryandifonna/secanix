import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLicense } from "../src/licenseCheck.js";

describe("checkLicense", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns invalid without calling fetch when the key is undefined", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkLicense(undefined);

    expect(result).toEqual({ status: "invalid", message: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns invalid without calling fetch when the key is an empty string", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkLicense("");

    expect(result).toEqual({ status: "invalid", message: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns valid when LemonSqueezy responds with valid: true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ valid: true }) })
    );

    const result = await checkLicense("real-key");

    expect(result).toEqual({ status: "valid" });
  });

  it("returns invalid with LemonSqueezy's own error message when valid is false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ valid: false, error: "license_key_not_found" }),
      })
    );

    const result = await checkLicense("wrong-key");

    expect(result).toEqual({ status: "invalid", message: "license_key_not_found" });
  });

  it("returns invalid with a default message when valid is false and no error string is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ valid: false }) })
    );

    const result = await checkLicense("wrong-key");

    expect(result).toEqual({ status: "invalid", message: expect.any(String) });
  });

  it("returns error when fetch throws (network failure or timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const result = await checkLicense("any-key");

    expect(result.status).toBe("error");
    expect((result as { message: string }).message).toContain("fetch failed");
  });

  it("returns error when the response body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })
    );

    const result = await checkLicense("any-key");

    expect(result.status).toBe("error");
  });

  it("returns error when the response body has no 'valid' field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ unexpected: "shape" }) })
    );

    const result = await checkLicense("any-key");

    expect(result.status).toBe("error");
  });

  it("POSTs the license key as form-encoded body to the validate endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ valid: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await checkLicense("my-key");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lemonsqueezy.com/v1/licenses/validate",
      expect.objectContaining({ method: "POST" })
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = options.body as URLSearchParams;
    expect(body.get("license_key")).toBe("my-key");
  });
});
