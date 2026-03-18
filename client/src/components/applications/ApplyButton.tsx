import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle, XCircle, Send, ExternalLink, RotateCcw } from 'lucide-react'
import api from '../../lib/api'
import { isAuthenticated } from '../../lib/auth'
import { getApplyMode } from '../../lib/apply-mode'

interface ApplyButtonProps {
  jobId: string
  jobUrl?: string
  applyMode?: 'auto' | 'tab'
  existingApplication?: { id: string; status: string } | null
  onApplied?: (applicationId: string) => void
}

const STATUS_DISPLAY: Record<string, { label: string; class: string }> = {
  PENDING: { label: 'Queued...', class: 'bg-slate-100 text-slate-600' },
  IN_PROGRESS: { label: 'Applying...', class: 'bg-blue-100 text-blue-700' },
  SUBMITTED: { label: 'Applied!', class: 'bg-green-100 text-green-700' },
  FAILED: { label: 'Failed', class: 'bg-red-100 text-red-700' },
  INTERVIEWING: { label: 'Interview', class: 'bg-purple-100 text-purple-700' },
  REJECTED: { label: 'Rejected', class: 'bg-slate-100 text-slate-500' },
  OFFER: { label: 'Offer!', class: 'bg-green-100 text-green-800' },
}

const TERMINAL = ['SUBMITTED', 'FAILED', 'INTERVIEWING', 'REJECTED', 'OFFER']

export default function ApplyButton({ jobId, jobUrl, applyMode, existingApplication, onApplied }: ApplyButtonProps) {
  const navigate = useNavigate()
  const [applicationId, setApplicationId] = useState<string | null>(existingApplication?.id || null)
  const [status, setStatus] = useState<string | null>(existingApplication?.status || null)
  const [loading, setLoading] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failReason, setFailReason] = useState<string | null>(null)

  // Resolve effective mode: prop > localStorage > default 'auto'
  const effectiveMode = applyMode ?? getApplyMode()

  // Poll for status updates while job is in-flight (auto mode only)
  useEffect(() => {
    if (!applicationId || !status || TERMINAL.includes(status)) return

    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/applications/${applicationId}`)
        setStatus(data.status)
        if (data.errorMessage) setFailReason(data.errorMessage)
        if (TERMINAL.includes(data.status)) clearInterval(interval)
      } catch {
        clearInterval(interval)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [applicationId, status])

  async function handleApply() {
    if (!isAuthenticated()) {
      navigate('/login')
      return
    }

    if (effectiveMode === 'tab') {
      // Open in new tab and create a pending record for tracking
      if (jobUrl) window.open(jobUrl, '_blank', 'noopener,noreferrer')
      try {
        const { data } = await api.post('/apply', { jobId, skipQueue: true })
        setApplicationId(data.applicationId)
        setStatus('PENDING')
        onApplied?.(data.applicationId)
      } catch { /* ignore tracking errors */ }
      return
    }

    // Auto mode — queue Playwright job
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post('/apply', { jobId })
      setApplicationId(data.applicationId)
      setStatus('PENDING')
      onApplied?.(data.applicationId)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to apply')
    } finally {
      setLoading(false)
    }
  }

  async function handleRetry() {
    if (!applicationId) return
    setRetrying(true)
    setFailReason(null)
    try {
      await api.post(`/applications/${applicationId}/retry`)
      setStatus('PENDING')
    } catch (err: any) {
      setFailReason(err.response?.data?.error || 'Retry failed')
    } finally {
      setRetrying(false)
    }
  }

  if (status) {
    const display = STATUS_DISPLAY[status] || { label: status, class: 'bg-slate-100' }
    const isActive = !TERMINAL.includes(status)
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${display.class}`}
            title={failReason || undefined}
          >
            {isActive && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {status === 'SUBMITTED' && <CheckCircle className="w-3.5 h-3.5" />}
            {status === 'FAILED' && <XCircle className="w-3.5 h-3.5" />}
            {display.label}
          </span>
          {status === 'FAILED' && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              title="Retry"
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 transition-colors"
            >
              {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        {status === 'FAILED' && failReason && (
          <p className="text-xs text-red-500 max-w-[200px] leading-tight">{failReason}</p>
        )}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={handleApply}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : effectiveMode === 'tab' ? (
          <ExternalLink className="w-4 h-4" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {loading ? 'Applying...' : effectiveMode === 'tab' ? 'Open to Apply' : 'Auto Apply'}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
