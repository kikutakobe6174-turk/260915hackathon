"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { MAIN_NAV, SECONDARY_NAV, filterNavByRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { ChevronDown, FileSearch, Home, Library, Settings2 } from "lucide-react";

const NAV_ICONS = {
  "/": Home,
  "/tests": FileSearch,
  "/problem-bank": Library,
};

export function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const secondaryItems = user ? filterNavByRole(SECONDARY_NAV, user.role) : [];
  const onSecondaryPage = secondaryItems.some((item) => pathname.startsWith(item.href));
  const [othersOpen, setOthersOpen] = useState(onSecondaryPage);

  if (!user) return null;

  const items = filterNavByRole(MAIN_NAV, user.role);

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = NAV_ICONS[item.href as keyof typeof NAV_ICONS];
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
      </div>

      {secondaryItems.length > 0 && (
        <div className="mt-auto border-t border-slate-200 pt-3">
          <button
            type="button"
            aria-expanded={othersOpen}
            onClick={() => setOthersOpen((value) => !value)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            <Settings2 className="h-4 w-4" />
            その他
            <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", othersOpen && "rotate-180")} />
          </button>
          {othersOpen && (
            <div className="mt-1 flex flex-col gap-0.5">
              {secondaryItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-md px-3 py-2 pl-9 text-sm transition-colors",
                      active
                        ? "bg-slate-200 font-medium text-slate-900"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
