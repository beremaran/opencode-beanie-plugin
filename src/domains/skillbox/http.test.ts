import {afterEach, describe, expect, test} from "bun:test";
import {httpGetJson, httpGetText, HttpError} from "./http";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("http", () => {
  test("httpGetJson parses successful response", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ hello: "world" }), { status: 200 })) as typeof fetch;

    const res = await httpGetJson<{ hello: string }>("https://example.com/api");
    expect(res.hello).toBe("world");
  });

  test("httpGetText returns body as text", async () => {
    globalThis.fetch = (async () => new Response("plain text data", { status: 200 })) as typeof fetch;

    const text = await httpGetText("https://example.com/doc");
    expect(text).toBe("plain text data");
  });

  test("throws HttpError on non-retryable 404", async () => {
    globalThis.fetch = (async () => new Response("Not Found", { status: 404 })) as typeof fetch;

    await expect(httpGetJson("https://example.com/404")).rejects.toThrow(HttpError);
  });

  test("retries on 500 status and succeeds if second attempt passes", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("Server Error", { status: 500 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const res = await httpGetJson<{ ok: boolean }>("https://example.com/retry", {
      retries: 2,
      backoffMs: 1,
    });
    expect(res.ok).toBe(true);
    expect(attempts).toBe(2);
  });

  test("throws HttpError after exceeding max retries", async () => {
    globalThis.fetch = (async () => new Response("Server Error", { status: 500 })) as typeof fetch;

    await expect(
      httpGetJson("https://example.com/fail", { retries: 1, backoffMs: 1 }),
    ).rejects.toThrow(HttpError);
  });

  test("parses retry-after header", async () => {
    globalThis.fetch = (async () => new Response("Rate limit", {
      status: 429,
      headers: { "retry-after": "5" },
    })) as typeof fetch;

    try {
      await httpGetJson("https://example.com/429", { retries: 0 });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).retryAfterSeconds).toBe(5);
    }
  });

  test("throws HttpError on invalid json response", async () => {
    globalThis.fetch = (async () => new Response("not json", { status: 200 })) as typeof fetch;

    await expect(httpGetJson("https://example.com/bad-json", { retries: 0 })).rejects.toThrow(HttpError);
  });
});
