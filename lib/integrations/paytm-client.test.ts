import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DefensePackage } from "../../contracts";
import { submitDefenseResponse } from "./paytm-client";

const pkg: DefensePackage = {
  disputeId: "d1",
  reasonCode: "13.1",
  amountPaise: 100,
  summary: "s",
  evidenceRefs: [],
};
const input = { idempotencyKey: "key-1", package: pkg };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const sleep = vi.fn(async () => {});

describe("submitDefenseResponse", () => {
  beforeEach(() => {
    sleep.mockClear();
    delete process.env.PAYTM_API_BASE_URL;
  });
  afterEach(() => {
    delete process.env.PAYTM_API_BASE_URL;
  });

  it("returns the provider ref on success and sends the key, body and a timeout signal", async () => {
    process.env.PAYTM_API_BASE_URL = "http://sim.test/";
    const fetchMock = vi.fn(async () => json(200, { providerRef: "ref_1" }));
    const result = await submitDefenseResponse(input, { fetch: fetchMock as never, sleep });

    expect(result).toEqual({ ok: true, providerRef: "ref_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://sim.test/api/paytm-sim/disputes/respond");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("key-1");
    expect(JSON.parse(init.body as string)).toEqual(pkg);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("defaults to localhost:3000", async () => {
    const fetchMock = vi.fn(async () => json(200, { providerRef: "r" }));
    await submitDefenseResponse(input, { fetch: fetchMock as never, sleep });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "http://localhost:3000/api/paytm-sim/disputes/respond",
    );
  });

  it("retries a 503 and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(503, { error: "x" }))
      .mockResolvedValueOnce(json(200, { providerRef: "ref_2" }));
    const result = await submitDefenseResponse(input, { fetch: fetchMock as never, sleep });
    expect(result).toEqual({ ok: true, providerRef: "ref_2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 400", async () => {
    const fetchMock = vi.fn(async () => json(400, { error: "bad" }));
    const result = await submitDefenseResponse(input, { fetch: fetchMock as never, sleep });
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after 2 retries on repeated timeouts and reports a retryable failure", async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const result = await submitDefenseResponse(input, { fetch: fetchMock as never, sleep });
    expect(result).toEqual({ ok: false, retryable: true, message: "The provider timed out." });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a network error", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(200, { providerRef: "ref_3" }));
    expect(await submitDefenseResponse(input, { fetch: fetchMock as never, sleep })).toEqual({
      ok: true,
      providerRef: "ref_3",
    });
  });

  it("rejects a 2xx response with an invalid body, without retrying", async () => {
    const fetchMock = vi.fn(async () => json(200, { nope: true }));
    const result = await submitDefenseResponse(input, { fetch: fetchMock as never, sleep });
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
