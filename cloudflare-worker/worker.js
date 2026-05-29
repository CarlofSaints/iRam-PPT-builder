/**
 * Cloudflare Worker — Perigee Image Proxy + Login
 *
 * Routes:
 *   GET  /?url=<perigee-url>  — Proxy image requests (with session cookie via X-Perigee-Cookie header)
 *   POST /login               — Authenticate with Perigee, return session cookie
 *
 * Deploy: Cloudflare Dashboard > Workers & Pages > perigee-proxy > Edit Code > paste > Deploy
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204);
    }

    // POST /login — Perigee authentication
    if (request.method === "POST" && url.pathname === "/login") {
      return handleLogin(request);
    }

    // GET /?url=... — Image proxy
    if (request.method === "GET") {
      return handleImageProxy(request, url);
    }

    return corsResponse("Method not allowed", 405);
  },
};

/* ── Helpers ─────────────────────────────────────────── */

function corsResponse(body, status = 200, contentType = "text/plain") {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
  if (contentType) headers["Content-Type"] = contentType;
  return new Response(body, { status, headers });
}

function jsonResponse(data, status = 200) {
  return corsResponse(JSON.stringify(data), status, "application/json");
}

/* ── Login Handler ───────────────────────────────────── */

async function handleLogin(request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return jsonResponse({ error: "Missing username or password" }, 400);
    }

    const UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

    // Step 1: GET login page to extract form tokens + anonymous session cookie
    const pageRes = await fetch("https://live.perigeeportal.co.za/user/login", {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
    const pageHtml = await pageRes.text();

    // Extract form_build_id
    const buildIdMatch = pageHtml.match(
      /name="form_build_id"\s+value="([^"]+)"/
    );
    // Extract form_token (if present)
    const tokenMatch = pageHtml.match(
      /name="form_token"\s+value="([^"]+)"/
    );

    // Collect cookies from the login page response (anonymous session)
    const pageCookies = extractCookies(pageRes);

    // Step 2: POST credentials
    const formBody = new URLSearchParams();
    formBody.append("name", username);
    formBody.append("pass", password);
    formBody.append("form_id", "user_login");
    formBody.append("op", "Log in");
    if (buildIdMatch) formBody.append("form_build_id", buildIdMatch[1]);
    if (tokenMatch) formBody.append("form_token", tokenMatch[1]);

    const loginRes = await fetch(
      "https://live.perigeeportal.co.za/user/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
          ...(pageCookies ? { Cookie: pageCookies } : {}),
        },
        body: formBody.toString(),
        redirect: "manual", // Capture the 302 + Set-Cookie
      }
    );

    // Extract SSESS cookie from the login response
    const sessCookie = extractSessCookie(loginRes);

    if (sessCookie) {
      return jsonResponse({ ok: true, cookie: sessCookie });
    }

    // Login failed — Drupal returns 200 (re-shows form) on invalid creds,
    // or 302 without a new SSESS cookie if something else is wrong
    const status = loginRes.status;
    return jsonResponse(
      {
        error:
          status === 200
            ? "Invalid username or password"
            : `Login returned HTTP ${status} but no session cookie was set`,
      },
      401
    );
  } catch (err) {
    return jsonResponse({ error: `Login error: ${err.message}` }, 500);
  }
}

/**
 * Parse Set-Cookie headers and return a "Cookie" header string for forwarding.
 */
function extractCookies(response) {
  const parts = [];
  // getSetCookie() returns an array of individual Set-Cookie values
  if (typeof response.headers.getSetCookie === "function") {
    for (const sc of response.headers.getSetCookie()) {
      const nv = sc.split(";")[0].trim();
      if (nv) parts.push(nv);
    }
  } else {
    // Fallback: headers.get("set-cookie") is comma-joined (fragile but best effort)
    const raw = response.headers.get("set-cookie") || "";
    for (const segment of raw.split(/,(?=[^ ])/)) {
      const nv = segment.split(";")[0].trim();
      if (nv && nv.includes("=")) parts.push(nv);
    }
  }
  return parts.join("; ");
}

/**
 * Find the SSESS (Drupal HTTPS session) cookie in the response.
 * Returns the full "SSESS...=value" string or null.
 */
function extractSessCookie(response) {
  if (typeof response.headers.getSetCookie === "function") {
    for (const sc of response.headers.getSetCookie()) {
      const nv = sc.split(";")[0].trim();
      if (nv.startsWith("SSESS")) return nv;
    }
  } else {
    const raw = response.headers.get("set-cookie") || "";
    const match = raw.match(/(SSESS[a-f0-9]+=[^\s;,]+)/);
    if (match) return match[1];
  }
  return null;
}

/* ── Image Proxy Handler ─────────────────────────────── */

async function handleImageProxy(request, url) {
  const imageUrl = url.searchParams.get("url");

  if (!imageUrl) {
    return corsResponse("Missing url param", 400);
  }

  if (!imageUrl.startsWith("https://live.perigeeportal.co.za")) {
    return corsResponse("Disallowed domain", 403);
  }

  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const cookie = request.headers.get("X-Perigee-Cookie");
    if (cookie) {
      headers["Cookie"] = cookie;
    }

    const upstream = await fetch(imageUrl, { headers });

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const body = await upstream.arrayBuffer();

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
