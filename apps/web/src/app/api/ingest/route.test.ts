import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeIngestRequest } from "../../../lib/ingest-auth";

function makeRequest(url: string, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: new Headers(headers),
  });
}

describe("authorizeIngestRequest", () => {
  let previousToken: string | undefined;

  beforeEach(() => {
    previousToken = process.env.AGENT_DEBUGGER_INGEST_TOKEN;
    delete process.env.AGENT_DEBUGGER_INGEST_TOKEN;
  });

  afterEach(() => {
    if (previousToken === undefined) {
      delete process.env.AGENT_DEBUGGER_INGEST_TOKEN;
      return;
    }
    process.env.AGENT_DEBUGGER_INGEST_TOKEN = previousToken;
  });

  it("allows loopback requests when no token is configured", () => {
    const request = makeRequest("http://localhost:3000/api/ingest", {
      host: "localhost:3000",
    });

    expect(authorizeIngestRequest(request)).toEqual({ ok: true });
  });

  it("rejects non-loopback requests when no token is configured", () => {
    const request = makeRequest("https://example.com/api/ingest", {
      host: "example.com",
    });

    expect(authorizeIngestRequest(request)).toMatchObject({
      ok: false,
      status: 403,
      error: "forbidden",
    });
  });

  it("rejects loopback host requests when forwarded ip is remote", () => {
    const request = makeRequest("http://localhost:3000/api/ingest", {
      host: "localhost:3000",
      "x-forwarded-for": "203.0.113.12",
    });

    expect(authorizeIngestRequest(request)).toMatchObject({
      ok: false,
      status: 403,
      error: "forbidden",
    });
  });

  it("requires bearer token when configured", () => {
    process.env.AGENT_DEBUGGER_INGEST_TOKEN = "secret-token";

    const unauthorized = makeRequest("https://example.com/api/ingest", {
      host: "example.com",
    });
    expect(authorizeIngestRequest(unauthorized)).toMatchObject({
      ok: false,
      status: 401,
      error: "unauthorized",
    });

    const authorized = makeRequest("https://example.com/api/ingest", {
      host: "example.com",
      authorization: "Bearer secret-token",
    });
    expect(authorizeIngestRequest(authorized)).toEqual({ ok: true });
  });
});
