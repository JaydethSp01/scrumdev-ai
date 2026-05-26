"use client";

import { useState } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { ChevronRight, Hash, Info, Check, Copy } from "lucide-react";

type Props = {
  children: string;
  className?: string;
};

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  const obj = node as unknown as { props?: { children?: ReactNode } };
  if (obj && typeof obj === "object" && "props" in obj) {
    return extractText(obj.props?.children);
  }
  return "";
}

function CodeBlock({
  language,
  text,
}: {
  language: string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900">
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800/70 text-neutral-300 text-[11px] uppercase tracking-wider">
        <span className="font-mono">{language || "code"}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-neutral-700 text-neutral-300"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="overflow-x-auto m-0 p-4 text-sm text-neutral-100 leading-relaxed font-mono">
        <code>{text}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mt-5 mb-3">
      <ChevronRight size={18} className="text-brand shrink-0" />
      <span>{children}</span>
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mt-5 mb-2">
      <ChevronRight size={16} className="text-brand shrink-0" />
      <span>{children}</span>
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 mt-4 mb-2">
      <Hash size={14} className="text-brand shrink-0" />
      <span>{children}</span>
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mt-3 mb-1.5">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 my-2">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="my-3 space-y-1.5 ml-1 marker:text-brand list-disc list-inside text-neutral-700 dark:text-neutral-300">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 space-y-1.5 ml-1 marker:text-brand marker:font-semibold list-decimal list-inside text-neutral-700 dark:text-neutral-300">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="py-1 text-sm leading-relaxed pl-1">{children}</li>
  ),
  code: ({
    className,
    children,
    ...rest
  }: ComponentPropsWithoutRef<"code"> & { inline?: boolean }) => {
    const inline = (rest as { inline?: boolean }).inline;
    if (inline) {
      return (
        <code className="bg-brand/10 text-brand px-1.5 py-0.5 rounded text-[0.85em] font-mono">
          {children}
        </code>
      );
    }
    const match = /language-([\w-]+)/.exec(className || "");
    const lang = match ? match[1] : "text";
    const text = extractText(children).replace(/\n$/, "");
    return <CodeBlock language={lang} text={text} />;
  },
  pre: ({ children }) => <>{children}</>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="text-left font-semibold px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-900 text-neutral-700 dark:text-neutral-300">
      {children}
    </td>
  ),
  blockquote: ({ children }) => (
    <div className="my-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 flex items-start gap-2">
      <Info size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
      <div className="text-sm text-blue-900 dark:text-blue-200 [&>p]:my-0">
        {children}
      </div>
    </div>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-brand underline hover:text-brand-dark"
    >
      {children}
    </a>
  ),
  hr: () => (
    <hr className="my-5 border-neutral-200 dark:border-neutral-800" />
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-neutral-900 dark:text-neutral-100">
      {children}
    </strong>
  ),
  em: ({ children }) => (
    <em className="italic text-neutral-800 dark:text-neutral-200">
      {children}
    </em>
  ),
};

export function PrettyMarkdown({ children, className }: Props) {
  return (
    <div className={`pretty-md ${className || ""}`}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}

export default PrettyMarkdown;
