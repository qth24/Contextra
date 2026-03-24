import cors from "cors";
import express, { Request, Response } from "express";

const app = express();
const port = Number(process.env.PORT || 4000);
const contentServiceUrl = process.env.CONTENT_SERVICE_URL || "http://localhost:4100";
const writeRateLimits = new Map<string, number>();

app.use(cors());
app.use(express.json({ limit: "12mb" }));

const getRateLimitConfig = (request: Request) => {
  const path = request.originalUrl;
  if (path.includes("/chapters/generate")) {
    return {
      windowMs: 15000,
      message: "Please wait 15 seconds before sending another generation prompt.",
    };
  }

  if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
    return {
      windowMs: 1200,
      message: "You are sending actions too quickly. Please slow down for a moment.",
    };
  }

  return null;
};

app.use("/api", (request, response, next) => {
  const config = getRateLimitConfig(request);
  if (!config) {
    next();
    return;
  }

  const identifier = request.headers.authorization || request.ip || "anonymous";
  const key = `${request.method}:${request.path}:${identifier}`;
  const now = Date.now();
  const availableAt = writeRateLimits.get(key) || 0;

  if (availableAt > now) {
    const retryAfterSeconds = Math.ceil((availableAt - now) / 1000);
    response.status(429).json({
      message: config.message,
      retryAfterSeconds,
    });
    return;
  }

  writeRateLimits.set(key, now + config.windowMs);
  next();
});

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "api-gateway",
    contentServiceUrl,
  });
});

app.use("/api", async (request: Request, response: Response) => {
  const targetUrl = `${contentServiceUrl}${request.originalUrl.replace(/^\/api/, "")}`;
  const headers = new Headers();

  const contentType = request.headers["content-type"];
  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const authHeader = request.headers.authorization;
  if (authHeader) {
    headers.set("Authorization", authHeader);
  }

  const outgoingRequest: RequestInit = {
    method: request.method,
    headers,
  };

  if (!["GET", "HEAD"].includes(request.method) && Object.keys(request.body ?? {}).length > 0) {
    outgoingRequest.body = JSON.stringify(request.body);
  }

  try {
    const upstream = await fetch(targetUrl, outgoingRequest);
    const responseContentType = upstream.headers.get("content-type") || "application/json";

    response.status(upstream.status);
    response.setHeader("Content-Type", responseContentType);

    if (responseContentType.includes("text/plain")) {
      response.send(await upstream.text());
      return;
    }

    if (responseContentType.startsWith("audio/")) {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      response.send(buffer);
      return;
    }

    response.send(await upstream.text());
  } catch (error) {
    response.status(502).json({
      message: "Gateway could not reach content service",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(port, () => {
  console.log(`api-gateway listening on port ${port}`);
});
