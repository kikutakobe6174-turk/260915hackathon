"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { MAIN_NAV, filterNavByRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { FileSearch, Home, Library } from "lucide-react";

const NAV_ICONS = {
  "/": Home,
  "/tests": FileSearch,
  "/problem-bank": Library,
};

export function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const items = filterNavByRole(MAIN_NAV, user.role);

  if (pathname === "/") {
    return (
      <nav className="w-48 shrink-0 border-r border-slate-200 bg-white p-3">
        <Link href="/" className="flex items-center gap-3 rounded-lg bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-800"><Home className="h-4 w-4" />ホーム</Link>
        <details className="mt-3 border-t border-slate-200 pt-3">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-500 hover:text-blue-700">その他の機能</summary>
          <div className="mt-1 flex flex-col gap-1">
            <Link href="/tests" className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">過去問分析</Link>
            <Link href="/problem-bank" className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">問題バンク</Link>
          </div>
        </details>
      </nav>
    );
  }

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-slate-200 bg-slate-50 p-3">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.href as keyof typeof NAV_ICONS];
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-blue-50 hover:text-blue-800"
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
