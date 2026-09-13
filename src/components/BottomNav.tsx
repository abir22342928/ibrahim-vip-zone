"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const pathname = usePathname();

  // Do not show on admin panel pages
  if (pathname.startsWith("/admin")) {
    return null;
  }

  const items = [
    { href: "/", label: "Home", icon: "🏠" },
    { href: "/orders", label: "Orders", icon: "📦" },
    { href: "/chat", label: "Chat", icon: "💬" },
    { href: "/account", label: "Account", icon: "👤" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#070c10]/95 backdrop-blur-lg sm:hidden">
      <div className="flex items-center justify-around py-2">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[0.7rem] font-bold transition ${
                active ? "text-[#b8ff2e]" : "text-white/55 hover:text-white"
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className={active ? "font-extrabold text-[#b8ff2e]" : ""}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
