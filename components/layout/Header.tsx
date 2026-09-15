"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/constants";

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <span className="text-sm font-semibold text-slate-900">
        ひかり塾 定期テスト演習システム
      </span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-700">
          {user.name}
          <span className="ml-1 text-xs text-slate-400">
            ({ROLE_LABEL[user.role]})
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            logout();
            router.push("/login");
          }}
        >
          ログアウト
        </Button>
      </div>
    </header>
  );
}
