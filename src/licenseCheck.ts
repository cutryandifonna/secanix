const VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
const REQUEST_TIMEOUT_MS = 10_000;

export type LicenseCheckResult =
  | { status: "valid" }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export async function checkLicense(key: string | undefined): Promise<LicenseCheckResult> {
  if (!key) {
    return { status: "invalid", message: "SECANIX_LICENSE_KEY is missing or empty." };
  }

  let response: { json: () => Promise<unknown> };
  try {
    response = await fetch(VALIDATE_URL, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams({ license_key: key }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return { status: "error", message: `Could not reach LemonSqueezy: ${(err as Error).message}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "error", message: "LemonSqueezy returned a non-JSON response." };
  }

  if (typeof body !== "object" || body === null || !("valid" in body)) {
    return { status: "error", message: "Unexpected response shape from LemonSqueezy." };
  }

  const { valid, error } = body as { valid?: unknown; error?: unknown };

  if (valid === true) {
    return { status: "valid" };
  }

  return {
    status: "invalid",
    message: typeof error === "string" ? error : "License key is invalid or expired.",
  };
}
