"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "@/lib/useAuth";

const NAV_ITEMS = [
  { href: "/", label: "Generate PPT", icon: "📊" },
  { href: "/pictures-to-cells", label: "Pictures to Cells", icon: "🖼️" },
  { href: "/control-centre", label: "Control Centre", icon: "⚙️" },
];

interface Props {
  session: Session;
  onLogout: () => void;
}

export default function Sidebar({ session, onLogout }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-[#32373C] text-white flex flex-col min-h-screen">
      {/* Logo + brand header */}
      <div className="px-4 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3 mb-1">
          <Image
            src="/iram-logo.png"
            alt="iRAM"
            width={40}
            height={40}
            className="rounded"
          />
          <div>
            <h1 className="text-base font-bold tracking-tight leading-tight">
              iRAM
            </h1>
            <p className="text-[11px] text-[#7CC042] font-medium leading-tight">
              PPT Builder
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-[#7CC042]/20 text-[#7CC042] border-l-[3px] border-[#7CC042]"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-[#7CC042] flex items-center justify-center text-xs font-bold text-white">
            {(session.name?.[0] || "U").toUpperCase()}
          </div>
          <div className="text-xs text-white/70 truncate">
            {session.name} {session.surname}
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-white/40 hover:text-red-400 transition-colors"
        >
          Sign out
        </button>
      </div>

      <div className="px-4 pb-4 text-[10px] text-white/30">
        OuterJoin &copy; {new Date().getFullYear()}
      </div>
    </aside>
  );
}
