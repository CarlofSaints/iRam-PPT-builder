@AGENTS.md

## Server session (27 Oct 2026)
- `/api/sso/callback` POST sets a signed httpOnly cookie `ppt_auth` (`lib/pptSession.ts`, key derived from IRAM_SSO_SECRET, 12 h); `proxy.ts` requires it on every `/api/*` except the callback; GET = session check (pages bounce to the Hub on 401), DELETE = sign out. Pictures to Cells log user = the cookie. SheetJS 0.20.3 from the SheetJS CDN. Same files as AM-PPT-builder.
