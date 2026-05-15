import { useState, useRef, useEffect } from 'react'
import { HelpCircle, X, Send, CheckCircle, AlertCircle } from 'lucide-react'
import { isAuthenticated, getUser, getToken } from '../../lib/auth'

export default function HelpButton() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const authed = isAuthenticated()

  // Pre-fill email if logged in
  useEffect(() => {
    if (authed) {
      const user = getUser()
      if (user?.email) setEmail(user.email)
    }
  }, [authed])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !message.trim()) return
    setStatus('sending')
    setErrorMsg('')
    try {
      const token = getToken()
      const res = await fetch('/api/help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: email.trim(), message: message.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send')
      }
      setStatus('sent')
      setMessage('')
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong')
      setStatus('error')
    }
  }

  function handleClose() {
    setOpen(false)
    if (status === 'sent') {
      setStatus('idle')
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-300/50 hover:shadow-xl hover:shadow-indigo-300/60 hover:scale-110 active:scale-95 transition-all duration-200"
        title="Get help"
        aria-label="Open help"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {/* Modal backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end sm:pb-24 sm:pr-6 md:pr-8">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={handleClose} />
          <div
            ref={modalRef}
            className="relative w-full sm:w-96 bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-white font-bold text-base">Help & Feedback</h2>
                <p className="text-indigo-200 text-xs mt-0.5">We'll get back to you via email</p>
              </div>
              <button
                onClick={handleClose}
                className="text-white/70 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-all duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              {status === 'sent' ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-7 h-7 text-emerald-500" />
                  </div>
                  <h3 className="font-semibold text-slate-900 text-base mb-1">Message sent!</h3>
                  <p className="text-sm text-slate-500">We'll review your request and get back to you shortly.</p>
                  <button
                    onClick={handleClose}
                    className="mt-5 px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-medium hover:from-indigo-600 hover:to-violet-600 transition-all duration-150"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {!authed && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        Your email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="w-full px-3 py-2.5 rounded-lg border bg-white border-slate-200 text-sm text-slate-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all duration-150"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      How can we help?
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Describe your issue or share feedback…"
                      required
                      rows={4}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none resize-none transition-all duration-150"
                    />
                  </div>

                  {status === 'error' && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {errorMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'sending' || !email.trim() || !message.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold hover:from-indigo-600 hover:to-violet-600 shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status === 'sending' ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Message
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
