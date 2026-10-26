
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.UI_PORT || process.env.PORT || 8080);
const ROOT = path.resolve("public");
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 12000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

function isPrivateIPv6(ip) {
  const value = ip.toLowerCase().split("%")[0];
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice(7);
    if (net.isIPv4(mapped)) return isPrivateIPv4(mapped);
    return true;
  }
  return value.startsWith("fc") || value.startsWith("fd") ||
    /^fe[89ab]/.test(value) || value.startsWith("ff") ||
    value.startsWith("2001:db8:");
}

async function validateTarget(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not allowed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Private network targets are not allowed.");
  }

  const ipType = net.isIP(hostname);
  if (ipType === 4 && isPrivateIPv4(hostname)) {
    throw new Error("Private network targets are not allowed.");
  }
  if (ipType === 6 && isPrivateIPv6(hostname)) {
    throw new Error("Private network targets are not allowed.");
  }

  if (!ipType) {
    let records;
    try {
      records = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new Error("The destination hostname could not be resolved.");
    }

    if (
      !records.length ||
      records.some(({ address, family }) =>
        family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address)
      )
    ) {
      throw new Error("The destination resolves to a restricted network.");
    }
  }

  url.hash = "";
  return url;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function errorPage(message) {
  return `<!doctype html>
  <html lang="en"><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Nova Proxy</title>
  <body style="font:16px system-ui;max-width:680px;margin:60px auto;padding:20px;background:#10121a;color:#eee">
  <h1>Page couldn't be loaded</h1><p>${escapeHtml(message)}</p>
  <p>Try another public HTTP or HTTPS website.</p></body></html>`;
}

function rewriteHtml(html, target) {
  const base = escapeHtml(target.href);
  let output = html;

  // Remove elements that could navigate the browser outside the proxy.
  output = output.replace(/<base\b[^>]*>/gi, "");
  output = output.replace(
    /<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi,
    ""
  );

  // Prevent active embedded content from accessing the browser's origin.
  output = output.replace(/<iframe\b/gi, "<iframe sandbox=\"allow-forms allow-scripts allow-same-origin\"");

  // Make relative resource URLs resolve against the original website.
  const head = output.match(/<head\b[^>]*>/i);
  if (head) {
    output = output.replace(head[0], `${head[0]}<base href="${base}">`);
  } else {
    output = `<head><base href="${base}"></head>${output}`;
  }

  return output;
}

async function fetchPublicPage(initialUrl) {
  let target = await validateTarget(initialUrl);

  for (let redirects = 0; redirects <= 5; redirects++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response;
    try {
      response = await fetch(target, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "NovaProxy/1.0",
          "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8"
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Invalid redirect response.");
      if (redirects === 5) throw new Error("Too many redirects.");

      target = await validateTarget(new URL(location, target).href);
      continue;
    }

    if (!response.ok) {
      throw new Error(`The website returned HTTP ${response.status}.`);
    }

    const type = response.headers.get("content-type") || "";
    if (!/^(text\/html|application\/xhtml\+xml|text\/plain)\b/i.test(type)) {
      throw new Error("This basic proxy supports HTML and plain text pages only.");
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_BYTES) {
      throw new Error("The page is too large for this demo proxy.");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("The website returned an empty response.");

    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          throw new Error("The page exceeds the 3 MB size limit.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder("utf-8").decode(bytes);
    return {
      html: /text\/plain/i.test(type)
        ? `<pre>${escapeHtml(text)}</pre>`
        : rewriteHtml(text, target),
      target
    };
  }

  throw new Error("Unable to load this destination.");
}

async function serveFile(res, file) {
  const absolute = path.resolve(ROOT, file);
  if (!absolute.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(absolute);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(absolute)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || "";
  const localOrigin = `http://${host}`;

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  let url;
  try {
    url = new URL(req.url, localOrigin);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: "Nova Proxy" }));
    return;
  }

  if (url.pathname === "/view") {
    const destination = url.searchParams.get("url");
    if (!destination) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Missing url parameter.");
      return;
    }

    try {
      const page = await fetchPublicPage(destination);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src https: http: data: blob: 'unsafe-inline' 'unsafe-eval'; object-src 'none'; frame-ancestors 'self'"
      });
      res.end(page.html);
    } catch (error) {
      res.writeHead(502, { "Content-Type": "text/html; charset=utf-8" });
      res.end(errorPage(error.name === "AbortError"
        ? "The website took too long to respond."
        : error.message || "The request failed."));
    }
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    await serveFile(res, "index.html");
  } else if (["/style.css", "/app.js"].includes(url.pathname)) {
    await serveFile(res, url.pathname.slice(1));
  } else {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Nova Proxy running at http://localhost:${PORT}`);
});
