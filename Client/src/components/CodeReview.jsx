import { useState, useEffect, useRef } from "react"
import { X, Loader2, Sparkles, Copy, Check } from "lucide-react"
import { MarkdownContent } from "./MarkdownContent"

export function CodeReview({ isOpen, onClose, isLoading, reviewData, reviewingUser }) {
  const [copied, setCopied] = useState(false)
  const contentRef = useRef(null)

  // Auto scroll to top when new review arrives
  useEffect(() => {
    if (contentRef.current && reviewData?.review) {
      contentRef.current.scrollTop = 0
    }
  }, [reviewData])

  const copyReview = () => {
    if (reviewData?.review) {
      navigator.clipboard.writeText(reviewData.review)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[85vh] mx-4 bg-white dark:bg-[#1e293b] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                AI Code Review
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Powered by Google Gemini
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {reviewData?.review && (
              <button
                onClick={copyReview}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                title="Copy review"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-purple-500" />
              <div className="text-center">
                <p className="text-slate-700 dark:text-slate-300 font-medium">
                  Analyzing your code...
                </p>
                {reviewingUser && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Requested by {reviewingUser}
                  </p>
                )}
              </div>
            </div>
          ) : reviewData?.success === false ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full">
                <X className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <div className="text-center">
                <p className="text-red-600 dark:text-red-400 font-medium">
                  Failed to get code review
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md">
                  {reviewData.error || "Please try again later"}
                </p>
              </div>
            </div>
          ) : reviewData?.review ? (
            <div className="max-w-none">
              <MarkdownContent content={reviewData.review} />
              {reviewData.reviewedBy && (
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                  Review requested by {reviewData.reviewedBy}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-400">
              <Sparkles className="h-12 w-12" />
              <p>Click "Review Code" to get AI-powered feedback</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
