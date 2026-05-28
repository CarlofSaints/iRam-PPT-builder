"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Generate PPT", icon: "M" },
  { href: "/control-centre", label: "Control Centre", icon: "C" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-[#32373C] text-white flex flex-col min-h-screen">
      <div className="p-4 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight">iRAM PPT Builder</h1>
      </div>
      <nav className="flex-1 p-2">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="w-6 h-6 rounded bg-white/20 flex items-center justify-center text-xs font-bold">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 text-xs text-white/40">
        OuterJoin &copy; {new Date().getFullYear()}
      </div>
    </aside>
  );
}
