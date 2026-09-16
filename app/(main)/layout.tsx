"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { UnderConstruction } from "@/components/layout/UnderConstruction";
import { isUnavailableRoute } from "@/lib/featureFlags";

// middlewareは使わない方針のため、未ログイン時のリダイレクトはこのクライアント側レイアウトで行う。
// ページ再読み込みではContextが初期化されるため、その都度ログインが必要になる仕様どおり。
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-x-hidden px-5 py-5 lg:px-8">
          {/* バックエンド未実装の画面は、直接URLで来てもエラーではなく「準備中」を出す。 */}
          {isUnavailableRoute(pathname) ? <UnderConstruction /> : children}
        </main>
      </div>
    </div>
  );
}
