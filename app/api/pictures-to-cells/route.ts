import { logRoute } from "@/components/pictures-to-cells/server";
import { sessionFromRequest } from "@/lib/pptSession";

// Who is calling comes from the signed session cookie set at Hub sign-in (lib/pptSession.ts),
// never from headers the browser sends.
export const { GET, POST } = logRoute({
  access: "public",
  user: async (req) => {
    const s = await sessionFromRequest(req);
    return s ? `${s.name} ${s.surname} (${s.email})`.replace(/\s+/g, " ").trim() : null;
  },
});
