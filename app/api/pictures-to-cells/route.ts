import { logRoute } from "@/components/pictures-to-cells/server";

// PPT Builder keeps no user list on the server (sign-in is the Hub's SSO, session in the
// browser), so the log takes the name the signed-in page sends, like the rest of this app.
export const { GET, POST } = logRoute({
  access: "public",
  user: async (req) => {
    const name = req.headers.get("x-user-name");
    return req.headers.get("x-user-id") && name ? decodeURIComponent(name) : null;
  },
});
