"use client";

import { useEffect } from "react";

export default function LoginPage() {
  useEffect(() => {
    // Auto-redirect to Hub SSO login
    const hubUrl =
      process.env.NEXT_PUBLIC_IRAM_HUB_URL || "https://iram-hub.vercel.app";
    const callback = `${window.location.origin}/sso/callback`;

    // Check if already has a session — redirect home
    const raw = localStorage.getItem("ppt_session");
    if (raw) {
      try {
        const s = JSON.parse(raw);
        if (s?.id) {
          window.location.href = "/";
          return;
        }
      } catch {
        /* ignore */
      }
    }

    window.location.href = `${hubUrl}/login?redirect=${encodeURIComponent(callback)}&module=ppt`;
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-gray-400 text-sm mb-4">
          Redirecting to iRam Hub...
        </div>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            const hubUrl =
              process.env.NEXT_PUBLIC_IRAM_HUB_URL ||
              "https://iram-hub.vercel.app";
            const callback = `${window.location.origin}/sso/callback`;
            window.location.href = `${hubUrl}/login?redirect=${encodeURIComponent(callback)}&module=ppt`;
          }}
          className="text-sm text-[#7CC042] hover:underline"
        >
          Click here if not redirected
        </a>
      </div>
    </div>
  );
}
