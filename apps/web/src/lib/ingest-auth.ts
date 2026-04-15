const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHost(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const idx = trimmed.indexOf("]");
    if (idx > 0) {
      return trimmed.slice(1, idx);
    }
    return trimmed;
  }
  return trimmed.split(":")[0] ?? trimmed;
}

function isLoopbackHost(value: string | null) {
  if (!value) return false;
  return LOOPBACK_HOSTS.has(normalizeHost(value));
}

function isLoopbackIp(value: string | null) {
  if (!value) return false;
  const ip = value.split(",")[0]?.trim() ?? "";
  if (!ip) return false;
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("::ffff:")) {
    return ip.slice("::ffff:".length) === "127.0.0.1";
  }
  return false;
}

function readBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token;
}

export function authorizeIngestRequest(request: Request) {
  const requiredToken = process.env.AGENT_DEBUGGER_INGEST_TOKEN;
  const suppliedToken = readBearerToken(request.headers.get("authorization"));
  if (requiredToken) {
    if (suppliedToken === requiredToken) {
      return { ok: true as const };
    }
    return {
      ok: false as const,
      status: 401,
      error: "unauthorized",
      message: "Missing or invalid bearer token.",
    };
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");
  const hostIsLoopback = isLoopbackHost(forwardedHost) || isLoopbackHost(hostHeader);

  let requestUrlHost = "";
  try {
    requestUrlHost = new URL(request.url).host;
  } catch {
    requestUrlHost = "";
  }

  if (!hostIsLoopback && !isLoopbackHost(requestUrlHost)) {
    return {
      ok: false as const,
      status: 403,
      error: "forbidden",
      message:
        "Remote ingest requires AGENT_DEBUGGER_INGEST_TOKEN. Without it, only loopback hosts are allowed.",
    };
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  if (forwardedFor && !isLoopbackIp(forwardedFor)) {
    return {
      ok: false as const,
      status: 403,
      error: "forbidden",
      message: "Remote ingest is blocked without AGENT_DEBUGGER_INGEST_TOKEN.",
    };
  }
  if (realIp && !isLoopbackIp(realIp)) {
    return {
      ok: false as const,
      status: 403,
      error: "forbidden",
      message: "Remote ingest is blocked without AGENT_DEBUGGER_INGEST_TOKEN.",
    };
  }

  return { ok: true as const };
}
