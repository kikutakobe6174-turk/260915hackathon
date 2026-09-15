"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MASTERS_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function MastersNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-slate-200">
      {MASTERS_NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium",
              active
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
