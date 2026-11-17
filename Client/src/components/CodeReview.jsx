import { useEffect, useRef, useState } from "react"
import { Check, Copy } from "lucide-react"
import { Drawer } from "./Drawer"
import { MarkdownContent } from "./MarkdownContent"
import { Button } from "./ui/Button"

export function CodeReview({ isOpen, onClose, isLoading, reviewData, reviewingUser, fileName }) {
  const [copied, setCopied] = useState(false)
  const contentRef = useRef(null)

  useEffect(() => {
    if (contentRef.current && reviewData?.review) contentRef.current.scrollTop = 0
  }, [reviewData])

  if (!isOpen) return null

  const copyReview = () => {
    navigator.clipboard.writeText(reviewData.review)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const requestedBy = reviewData?.reviewedBy || reviewingUser
  const subtitle = requestedBy ? `Gemini · asked for by ${requestedBy}` : "Gemini reads the file and suggests fixes"

  return (
    <Drawer
      title="Review"
      subtitle={subtitle}
      onClose={onClose}
      actions={
        reviewData?.review && (
          <Button variant="ghost" size="icon" onClick={copyReview} aria-label="Copy the review" title="Copy the review">
            {copied ? <Check className="text-moss" /> : <Copy />}
          </Button>
        )
      }
    >
      <div ref={contentRef} className="flex-1 overflow-auto px-6 py-6">
        {isLoading ? (
          <Pending text={`Reviewing ${fileName}…`} />
        ) : reviewData?.success === false ? (
          <div className="rounded-md border border-danger/30 bg-danger/5 p-4">
            <p className="font-semibold text-danger">The review didn&rsquo;t come back</p>
            <p className="mt-1 text-[14px] text-muted">{reviewData.error || "Try again in a moment."}</p>
          </div>
        ) : reviewData?.review ? (
          <MarkdownContent content={reviewData.review} />
        ) : (
          <p className="text-[14px] text-muted">Press Review in the toolbar to get feedback on {fileName}.</p>
        )}
      </div>
    </Drawer>
  )
}

export function Pending({ text }) {
  return (
    <div className="space-y-3" role="status">
      <p className="text-[14px] text-muted">{text}</p>
      {[92, 78, 85, 60].map((w) => (
        <div key={w} className="h-3 animate-pulse rounded bg-sunk" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}
