/**
 * Cloudflare Worker — Perigee Image Proxy + Login
 *
 * Routes:
 *   GET  /?url=<perigee-url>  — Proxy image requests (with session cookie via X-Perigee-Cookie header)
 *   POST /login               — Authenticate with Perigee, return session cookie
 *   POST /login-debug         — Same as /login but returns step-by-step diagnostics
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
      return handleLogin(request, false);
    }

    // POST /login-debug — Perigee authentication with diagnostics
    if (request.method === "POST" && url.pathname === "/login-debug") {
      return handleLogin(request, true);
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

async function handleLogin(request, debug = false) {
  const diag = {};

  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return jsonResponse({ error: "Missing username or password" }, 400);
    }

    const UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

    // Step 1: GET login page to extract form tokens + anonymous session cookie
    const pageRes = await fetch(
      "https://live.perigeeportal.co.za/user/login",
      {
        headers: {
          "User-Agent": UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "manual",
      }
    );
    const pageHtml = await pageRes.text();

    if (debug) {
      diag.step1_getLoginPage = {
        status: pageRes.status,
        contentLength: pageHtml.length,
        hasLoginForm: pageHtml.includes("user-login"),
        htmlSnippet: pageHtml.substring(0, 500),
        setCookieHeaders: getAllSetCookieHeaders(pageRes),
      };
    }

    // Extract form_build_id (try both attribute orders)
    const buildIdMatch =
      pageHtml.match(/name="form_build_id"\s+value="([^"]+)"/) ||
      pageHtml.match(/value="([^"]+)"\s+name="form_build_id"/);

    // Extract form_token
    const tokenMatch =
      pageHtml.match(/name="form_token"\s+value="([^"]+)"/) ||
      pageHtml.match(/value="([^"]+)"\s+name="form_token"/);

    // Collect cookies from the login page response (anonymous session)
    const pageCookies = extractCookies(pageRes);

    if (debug) {
      diag.step1_tokens = {
        form_build_id: buildIdMatch ? buildIdMatch[1] : "NOT FOUND",
        form_token: tokenMatch ? tokenMatch[1] : "NOT FOUND",
        pageCookies: pageCookies || "NONE",
      };
    }

    // Step 2: POST credentials
    const formBody = new URLSearchParams();
    formBody.append("name", username);
    formBody.append("pass", password);
    formBody.append("form_id", "user_login");
    formBody.append("op", "Log in");
    if (buildIdMatch) formBody.append("form_build_id", buildIdMatch[1]);
    if (tokenMatch) formBody.append("form_token", tokenMatch[1]);

    const postHeaders = {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://live.perigeeportal.co.za/user/login",
      Origin: "https://live.perigeeportal.co.za",
    };
    if (pageCookies) postHeaders["Cookie"] = pageCookies;

    if (debug) {
      diag.step2_postRequest = {
        url: "https://live.perigeeportal.co.za/user/login",
        hasCookies: !!pageCookies,
        hasFormBuildId: !!buildIdMatch,
        hasFormToken: !!tokenMatch,
        formFields: Object.fromEntries(formBody.entries()),
      };
      // Mask password in debug output
      diag.step2_postRequest.formFields.pass = "***";
    }

    const loginRes = await fetch(
      "https://live.perigeeportal.co.za/user/login",
      {
        method: "POST",
        headers: postHeaders,
        body: formBody.toString(),
        redirect: "manual", // Capture the 302 + Set-Cookie
      }
    );

    const loginBody = await loginRes.text();

    if (debug) {
      diag.step2_postResponse = {
        status: loginRes.status,
        statusText: loginRes.statusText,
        location: loginRes.headers.get("location"),
        setCookieHeaders: getAllSetCookieHeaders(loginRes),
        contentLength: loginBody.length,
        bodySnippet: loginBody.substring(0, 500),
        hasErrorMessage:
          loginBody.includes("Sorry, unrecognized") ||
          loginBody.includes("Access denied") ||
          loginBody.includes("error"),
      };
    }

    // Extract SSESS cookie from the login response
    const sessCookie = extractSessCookie(loginRes);

    if (sessCookie) {
      const result = { ok: true, cookie: sessCookie };
      if (debug) result.diag = diag;
      return jsonResponse(result);
    }

    // Login failed
    const status = loginRes.status;
    let error;
    if (status === 200) {
      // Drupal re-shows the login form on invalid credentials
      if (loginBody.includes("Sorry, unrecognized")) {
        error = "Invalid username or password";
      } else if (loginBody.includes("Access denied")) {
        error = "Access denied by Perigee";
      } else {
        error =
          "Login returned 200 (form re-displayed) — likely invalid credentials";
      }
    } else if (status === 302 || status === 303) {
      // Redirect happened but no SSESS cookie — might be a redirect to the same login page
      const location = loginRes.headers.get("location") || "";
      error = `Redirected to ${location} but no session cookie was set`;
    } else if (status === 403) {
      error = `Perigee returned 403 Forbidden — the server may be blocking automated logins from this IP`;
    } else {
      error = `Login returned HTTP ${status} — no session cookie was set`;
    }

    const result = { error };
    if (debug) result.diag = diag;
    return jsonResponse(result, 401);
  } catch (err) {
    const result = { error: `Login error: ${err.message}` };
    if (debug) result.diag = diag;
    return jsonResponse(result, 500);
  }
}

/**
 * Get all Set-Cookie header values as an array (for diagnostics).
 */
function getAllSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get("set-cookie");
  return raw ? [raw] : [];
}

/**
 * Parse Set-Cookie headers and return a "Cookie" header string for forwarding.
 */
function extractCookies(response) {
  const parts = [];
  if (typeof response.headers.getSetCookie === "function") {
    for (const sc of response.headers.getSetCookie()) {
      const nv = sc.split(";")[0].trim();
      if (nv) parts.push(nv);
    }
  } else {
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
