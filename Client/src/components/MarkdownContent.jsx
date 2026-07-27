import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function MarkdownContent({ content, compact = false }) {
  const headingGap = compact ? "mt-4" : "mt-6"

  return (
    <div className="text-slate-700 dark:text-slate-200 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className={`${headingGap} mb-3 text-2xl font-bold text-slate-900 dark:text-white`}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className={`${headingGap} mb-2 text-xl font-semibold text-slate-900 dark:text-white`}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className={`${headingGap} mb-2 text-lg font-semibold text-slate-900 dark:text-white`}>{children}</h3>
          ),
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => <ul className="my-3 ml-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 ml-5 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-4 border-slate-300 dark:border-slate-600 pl-4 italic text-slate-600 dark:text-slate-300">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const raw = String(children || "")
            const isMultiline = raw.includes("\n")
            const isFencedCode = Boolean(className && className.includes("language-"))

            if (!isMultiline && !isFencedCode) {
              return (
                <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-sm text-blue-700 dark:text-blue-300">
                  {children}
                </code>
              )
            }

            return (
              <code className="block whitespace-pre overflow-x-auto rounded-lg bg-slate-100 dark:bg-slate-900 p-4 text-sm text-slate-800 dark:text-slate-200">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <pre className="my-4">{children}</pre>,
          hr: () => <hr className="my-5 border-slate-200 dark:border-slate-700" />,
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  )
}
