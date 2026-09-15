import katex from "katex";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 問題文中の $...$ (インライン) / $$...$$ (ブロック) をKaTeXでレンダリングし、
// それ以外のテキストはエスケープしたHTML文字列を返す。
export function renderLatexToHtml(source: string): string {
  const parts: string[] = [];
  let lastIndex = 0;
  const regex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source))) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(source.slice(lastIndex, match.index)));
    }
    const isBlock = match[1] !== undefined;
    const expr = isBlock ? match[1] : match[2];
    try {
      parts.push(katex.renderToString(expr ?? "", { throwOnError: false, displayMode: isBlock }));
    } catch {
      parts.push(escapeHtml(match[0]));
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < source.length) {
    parts.push(escapeHtml(source.slice(lastIndex)));
  }
  return parts.join("").replace(/\n/g, "<br/>");
}
