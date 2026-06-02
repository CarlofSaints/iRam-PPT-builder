"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "./Sidebar";

const PUBLIC_PATHS = ["/login", "/sso/callback"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Public pages: no sidebar, no auth check
  if (isPublic) {
    return <>{children}</>;
  }

  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const { session, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#32373C]">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/iram-logo.png" alt="iRAM" className="w-16 h-16 mx-auto mb-4 rounded-lg" />
          <div className="text-[#7CC042] text-sm font-medium">Loading...</div>
        </div>
      </div>
    );
  }

  if (!session) return null; // useAuth redirects to /login

  return (
    <div className="min-h-screen flex">
      <Sidebar session={session} onLogout={logout} />
      <main className="flex-1 bg-gray-50 p-6 overflow-y-auto">{children}</main>
    </div>
  );
}
