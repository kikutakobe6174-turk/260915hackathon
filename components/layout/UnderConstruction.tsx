import Link from "next/link";
import { Hammer } from "lucide-react";

/**
 * 未実装機能へ直接URLでアクセスされたときに出す安全な画面。
 * 404や500を見せず、メインフローへ戻す導線だけを置く。
 */
export function UnderConstruction() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
        <Hammer className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-bold text-slate-950">この機能は現在準備中です</h1>
      <p className="max-w-md text-sm leading-6 text-slate-600">
        今は「過去問を分析して対策問題とPDF・Wordを作る」流れをご利用いただけます。
        こちらの機能は準備ができ次第ご案内します。
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link href="/" className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          ホームへ戻る
        </Link>
        <Link href="/tests" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          過去問分析へ
        </Link>
      </div>
    </div>
  );
}
