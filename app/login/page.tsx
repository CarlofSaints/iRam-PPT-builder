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
    <div className="min-h-screen flex items-center justify-center bg-[#32373C]">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/iram-logo.png" alt="iRAM" className="w-20 h-20 mx-auto mb-4 rounded-lg" />
        <h1 className="text-white text-lg font-bold mb-1">iRAM PPT Builder</h1>
        <div className="text-white/50 text-sm mb-6">
          Redirecting to iRAM Hub...
        </div>
        <div className="w-8 h-8 mx-auto border-3 border-[#7CC042] border-t-transparent rounded-full animate-spin mb-6" />
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
