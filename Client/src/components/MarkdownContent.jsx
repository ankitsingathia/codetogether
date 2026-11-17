import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function MarkdownContent({ content, compact = false }) {
  const headingGap = compact ? "mt-4" : "mt-7 first:mt-0"

  return (
    <div className="text-[14.5px] leading-[1.7] text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className={`${headingGap} mb-2 font-display text-[19px] font-bold tracking-[-0.01em]`}>{children}</h3>,
          h2: ({ children }) => <h3 className={`${headingGap} mb-2 font-display text-[17px] font-bold`}>{children}</h3>,
          h3: ({ children }) => <h4 className={`${headingGap} mb-1.5 text-[15px] font-semibold`}>{children}</h4>,
          p: ({ children }) => <p className="my-2.5">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          ul: ({ children }) => <ul className="my-3 ml-5 list-disc space-y-1.5 marker:text-muted">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 ml-5 list-decimal space-y-1.5 marker:text-muted">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-line pl-4 text-muted">{children}</blockquote>
          ),
          code: ({ children, className }) => {
            const raw = String(children || "")
            const isBlock = raw.includes("\n") || Boolean(className?.includes("language-"))
            if (!isBlock) {
              return <code className="rounded bg-sunk px-1.5 py-0.5 font-mono text-[12.5px]">{children}</code>
            }
            return (
              <code className="block overflow-x-auto whitespace-pre rounded-lg border border-line bg-sunk p-4 font-mono text-[12.5px] leading-[1.7]">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <pre className="my-4">{children}</pre>,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-[13.5px]">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-line px-2 py-1.5 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-line px-2 py-1.5 align-top">{children}</td>,
          hr: () => <hr className="my-6 border-line" />,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-cobalt underline underline-offset-2">
              {children}
            </a>
          ),
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  )
}
