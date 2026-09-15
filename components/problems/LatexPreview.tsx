import { renderLatexToHtml } from "@/lib/latex";
import { cn } from "@/lib/utils";

export function LatexPreview({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) {
    return <p className={cn("text-sm text-slate-400", className)}>（プレビューはここに表示されます）</p>;
  }
  return (
    <div
      className={cn("text-sm leading-relaxed text-slate-900", className)}
      dangerouslySetInnerHTML={{ __html: renderLatexToHtml(text) }}
    />
  );
}
