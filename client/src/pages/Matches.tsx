import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Sparkles, MapPin, Building2, CalendarDays, Inbox, Send, CheckCircle, Settings2, ChevronDown, ChevronUp, FileText, Upload, Plus, X, Mail, AlertCircle } from 'lucide-react'
import api from '../lib/api'
import { isAuthenticated } from '../lib/auth'
import Spinner from '../components/ui/Spinner'
import AutocompleteInput from '../components/ui/AutocompleteInput'

interface JobMatch {
  company: string
  title: string
  link: string
  location: string
  match_rationale: string
  compatibility_score?: number
}

interface MatchSection {
  searchTitle: string
  matches: JobMatch[]
}

interface MatchRun {
  id: string
  runDate: string
  jobLinks: string[]
  topMatches: JobMatch[] | MatchSection[]
}

function QuickApplyButton({ job }: { job: JobMatch }) {
  return (
    <a
      href={job.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 !text-white text-sm font-medium rounded-lg hover:from-indigo-700 hover:to-violet-700 shadow-sm hover:shadow-md active:scale-[0.97] transition-all duration-150"
    >
      <ExternalLink className="w-3.5 h-3.5" />
      Apply
    </a>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function readGuestPrefs() {
  try { return JSON.parse(localStorage.getItem('jobsclaw_guest') || 'null') } catch { return null }
}

export default function Matches() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const authed = isAuthenticated()

  const [showSetup, setShowSetup] = useState(true)
  const [prefSaved, setPrefSaved] = useState(false)
  const [digestJobId, setDigestJobId] = useState<string | null>(null)
  const [resumeSuccess, setResumeSuccess] = useState(false)
  const [extraSlots, setExtraSlots] = useState(0)
  const [guestEmail, setGuestEmail] = useState('')
  const [guestResumeText, setGuestResumeText] = useState(() => readGuestPrefs()?.resumeText || '')
  const [guestResumeName, setGuestResumeName] = useState(() => readGuestPrefs()?.resumeName || '')
  const [guestDigestJobId, setGuestDigestJobId] = useState<string | null>(null)
  const [showCongratsBanner, setShowCongratsBanner] = useState(false)

  const [prefForm, setPrefForm] = useState(() => {
    const cached = queryClient.getQueryData<any>(['preferences'])
    const p = cached?.preference
    const guest = readGuestPrefs()
    return {
      keywords: p?.keywords || guest?.keywords || '',
      keywords2: p?.keywords2 || guest?.keywords2 || '',
      keywords3: p?.keywords3 || guest?.keywords3 || '',
      location: p?.location || guest?.location || '',
      dailyEmailTime: p?.dailyEmailTime || '09:00',
      emailEnabled: p?.emailEnabled ?? false,
      scrapeLimit: p?.scrapeLimit ?? guest?.scrapeLimit ?? 50,
      matchLimit: p?.matchLimit ?? guest?.matchLimit ?? 5,
    }
  })

  const prefsLoaded = useRef(!!queryClient.getQueryData(['preferences']))

  // Persist form to localStorage for guests so settings survive signup
  useEffect(() => {
    if (!authed) {
      localStorage.setItem('jobsclaw_guest', JSON.stringify({
        keywords: prefForm.keywords, keywords2: prefForm.keywords2, keywords3: prefForm.keywords3,
        location: prefForm.location, scrapeLimit: prefForm.scrapeLimit, matchLimit: prefForm.matchLimit,
      }))
    }
  }, [prefForm.keywords, prefForm.keywords2, prefForm.keywords3, prefForm.location, prefForm.scrapeLimit, prefForm.matchLimit, authed])

  useQuery({
    queryKey: ['preferences'],
    enabled: authed,
    queryFn: async () => {
      const { data } = await api.get('/preferences')
      if (data.preference) {
        // Migrate guest prefs into the user's account on first login
        const guest = readGuestPrefs()
        setPrefForm({
          keywords: data.preference.keywords || guest?.keywords || '',
          keywords2: data.preference.keywords2 || guest?.keywords2 || '',
          keywords3: data.preference.keywords3 || guest?.keywords3 || '',
          location: data.preference.location || guest?.location || '',
          dailyEmailTime: data.preference.dailyEmailTime || '09:00',
          emailEnabled: data.preference.emailEnabled ?? false,
          scrapeLimit: data.preference.scrapeLimit ?? guest?.scrapeLimit ?? 50,
          matchLimit: data.preference.matchLimit ?? guest?.matchLimit ?? 5,
        })
        if (guest) localStorage.removeItem('jobsclaw_guest')
      }
      prefsLoaded.current = true
      const k2 = data.preference?.keywords2 || ''
      const k3 = data.preference?.keywords3 || ''
      setExtraSlots(k3 ? 2 : k2 ? 1 : 0)
      return data
    },
  })

  // Auto-save for authenticated users
  useEffect(() => {
    if (!authed || !prefsLoaded.current) return
    const t = setTimeout(() => { api.put('/preferences', prefForm).catch(() => {}) }, 400)
    return () => clearTimeout(t)
  }, [prefForm.keywords, prefForm.keywords2, prefForm.keywords3, prefForm.location, prefForm.emailEnabled, prefForm.dailyEmailTime, prefForm.scrapeLimit, prefForm.matchLimit, authed])

  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    enabled: authed,
    queryFn: async () => { const { data } = await api.get('/profile'); return data },
  })

  const uploadResume = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('resume', file)
      return api.post('/profile/resume', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setResumeSuccess(true)
      setTimeout(() => setResumeSuccess(false), 3000)
    },
  })

  const uploadGuestResume = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('resume', file)
      return api.post('/profile/resume/guest', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: ({ data }, file) => {
      const text = data.resumeText || ''
      const name = file.name
      setGuestResumeText(text)
      setGuestResumeName(name)
      const current = readGuestPrefs() || {}
      localStorage.setItem('jobsclaw_guest', JSON.stringify({ ...current, resumeText: text, resumeName: name }))
    },
  })

  const savePreferences = useMutation({
    mutationFn: () => api.put('/preferences', prefForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
      setPrefSaved(true)
      setTimeout(() => setPrefSaved(false), 2000)
    },
  })

  const triggerDigest = useMutation({
    mutationFn: async () => { await api.put('/preferences', prefForm); return api.post('/preferences/trigger') },
    onSuccess: ({ data }) => { queryClient.invalidateQueries({ queryKey: ['preferences'] }); setDigestJobId(data.jobId) },
  })

  const triggerGuestDigest = useMutation({
    mutationFn: () => api.post('/preferences/trigger/guest', {
      email: guestEmail,
      resumeText: guestResumeText,
      keywords: prefForm.keywords, keywords2: prefForm.keywords2, keywords3: prefForm.keywords3,
      location: prefForm.location, scrapeLimit: prefForm.scrapeLimit, matchLimit: prefForm.matchLimit,
    }),
    onSuccess: ({ data }) => setGuestDigestJobId(data.jobId),
  })

  const { data: digestProgress } = useQuery({
    queryKey: ['digestProgress', digestJobId],
    queryFn: async () => {
      const { data } = await api.get(`/preferences/trigger/${digestJobId}`)
      return data as { state: string; progress: { step: string; percent: number; detail?: string } | null }
    },
    enabled: !!digestJobId,
    refetchInterval: (q) => { const s = q.state.data?.state; return (s === 'completed' || s === 'failed') ? false : 2000 },
  })

  const { data: guestDigestProgress } = useQuery({
    queryKey: ['guestDigestProgress', guestDigestJobId],
    queryFn: async () => {
      const { data } = await api.get(`/preferences/trigger/guest/${guestDigestJobId}`)
      return data as { state: string; progress: { step: string; percent: number; detail?: string } | null }
    },
    enabled: !!guestDigestJobId,
    refetchInterval: (q) => { const s = q.state.data?.state; return (s === 'completed' || s === 'failed') ? false : 2000 },
  })

  useEffect(() => {
    if (digestProgress?.state === 'completed') queryClient.invalidateQueries({ queryKey: ['matches'] })
  }, [digestProgress?.state])

  useEffect(() => {
    if (guestDigestProgress?.state === 'completed') setShowCongratsBanner(true)
  }, [guestDigestProgress?.state])

  const { data, isLoading } = useQuery<{ history: MatchRun[] }>({
    queryKey: ['matches'],
    enabled: authed,
    queryFn: async () => { const { data } = await api.get('/matches'); return data },
  })

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
  }

  const history = data?.history ?? []

  function getSections(run: MatchRun): MatchSection[] {
    if (!run.topMatches || !Array.isArray(run.topMatches) || run.topMatches.length === 0) return []
    if ('searchTitle' in run.topMatches[0]) return run.topMatches as MatchSection[]
    return [{ searchTitle: '', matches: run.topMatches as JobMatch[] }]
  }

  const totalJobs = history.reduce((sum, run) => getSections(run).reduce((s, sec) => s + sec.matches.length, sum), 0)

  const activeJobId = authed ? digestJobId : guestDigestJobId
  const activeProgress = authed ? digestProgress : guestDigestProgress
  const isRunning = !!activeJobId && activeProgress?.state !== 'completed' && activeProgress?.state !== 'failed'
  const guestAlreadySent = !!guestDigestJobId

  function openSignup() {
    navigate('/register', { state: { backgroundLocation: location } })
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.9))' }}>
              <Sparkles className="w-6 h-6 text-violet-500" />
            </span>
            <h1 className="text-2xl font-bold text-slate-900">AI Job Matches</h1>
          </div>
          <p className="text-sm text-slate-500">
            Jobs matched to your resume by AI — based on your search preferences
          </p>
        </div>
        {authed && totalJobs > 0 && (
          <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
            {totalJobs} jobs across {history.length} run{history.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Guest trial banner */}
      {!authed && (
        <div className="mb-5 bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
          <span style={{ filter: 'drop-shadow(0 0 4px rgba(167,139,250,0.7))' }}>
            <Sparkles className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Try JobsClaw free — no account needed</p>
            <p className="text-sm text-slate-600 mt-0.5">
              Enter your email and job title, and we'll send you AI-matched jobs right now.{' '}
              <button onClick={openSignup} className="text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2">
                Sign up
              </button>{' '}
              for automated daily emails.
            </p>
          </div>
        </div>
      )}

      {/* Setup + Send panel */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
        {/* Action bar */}
        <div className="flex items-center gap-3 p-4">
          {authed ? (
            <button
              onClick={() => { setDigestJobId(null); triggerDigest.mutate() }}
              disabled={isRunning || triggerDigest.isPending || !prefForm.keywords}
              title={!prefForm.keywords ? 'Set keywords first — click Setup' : 'Run AI matching now'}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium rounded-lg hover:from-indigo-700 hover:to-violet-700 shadow-sm hover:shadow-md active:scale-[0.97] disabled:opacity-50 transition-all duration-150 flex items-center gap-2"
            >
              {isRunning || triggerDigest.isPending ? <Spinner size="sm" /> : <Send className="w-4 h-4" />}
              {isRunning ? 'Running…' : 'Send Now'}
            </button>
          ) : (
            <button
              onClick={() => triggerGuestDigest.mutate()}
              disabled={isRunning || triggerGuestDigest.isPending || !prefForm.keywords || !guestEmail || guestAlreadySent}
              title={
                guestAlreadySent ? 'Sign up to send more'
                : !prefForm.keywords ? 'Set a job title first'
                : !guestEmail ? 'Enter your email first'
                : 'Send your AI job matches'
              }
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium rounded-lg hover:from-indigo-700 hover:to-violet-700 shadow-sm hover:shadow-md active:scale-[0.97] disabled:opacity-50 transition-all duration-150 flex items-center gap-2"
            >
              {isRunning || triggerGuestDigest.isPending ? <Spinner size="sm" /> : <Send className="w-4 h-4" />}
              {guestAlreadySent ? 'Email Sent ✓' : isRunning ? 'Running…' : 'Send My Job Matches'}
            </button>
          )}

          {prefForm.keywords ? (
            <span className="text-sm text-slate-600 truncate flex-1">
              <span className="font-medium">
                {[prefForm.keywords, prefForm.keywords2, prefForm.keywords3].filter(Boolean).join(' / ')}
              </span>
              {prefForm.location && <span className="text-slate-400"> · {prefForm.location}</span>}
            </span>
          ) : (
            <span className="text-sm text-amber-600 flex-1">No keywords set — configure below</span>
          )}

          <button
            onClick={() => setShowSetup((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors ml-auto"
          >
            <Settings2 className="w-4 h-4" />
            Setup
            {showSetup ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Progress bar */}
        {activeJobId && activeProgress && (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700">
                {activeProgress.state === 'failed' ? '✗ Failed' : activeProgress.progress?.step || 'Queued…'}
              </span>
              {activeProgress.progress && (
                <span className="text-xs text-slate-500">{activeProgress.progress.percent}%</span>
              )}
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5 mb-1.5">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  activeProgress.state === 'failed' ? 'bg-red-500' :
                  activeProgress.state === 'completed' ? 'bg-gradient-to-r from-emerald-500 to-teal-400' :
                  'bg-gradient-to-r from-indigo-500 to-violet-500'
                }`}
                style={{ width: `${activeProgress.progress?.percent ?? 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              {activeProgress.progress?.detail && (
                <p className="text-xs text-slate-500">{activeProgress.progress.detail}</p>
              )}
              {(activeProgress.state === 'completed' || activeProgress.state === 'failed') && (
                <button
                  onClick={() => authed ? setDigestJobId(null) : setGuestDigestJobId(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 ml-auto"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}

        {/* Expandable setup form */}
        {showSetup && (
          <div className="border-t border-slate-100 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Digest Settings</h3>

            {/* Guest email */}
            {!authed && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Your Email <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">We'll send your AI-matched jobs here — no account needed</p>
              </div>
            )}

            {/* Guest resume upload */}
            {!authed && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Resume (PDF) <span className="text-slate-400 font-normal">— optional but improves match quality</span>
                </label>
                {uploadGuestResume.isPending ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner size="sm" /> Uploading…</div>
                ) : guestResumeName ? (
                  <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700 truncate">{guestResumeName}</span>
                      {guestResumeText ? (
                        <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 flex-shrink-0">extracted ✓</span>
                      ) : (
                        <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex-shrink-0 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> no text found
                        </span>
                      )}
                    </div>
                    <label className="cursor-pointer flex-shrink-0 px-3 py-1 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                      Replace
                      <input type="file" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadGuestResume.mutate(f) }} className="hidden" />
                    </label>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border border-dashed border-slate-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors w-fit">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-500">Upload resume PDF</span>
                    <input type="file" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadGuestResume.mutate(f) }} className="hidden" />
                  </label>
                )}
                {uploadGuestResume.isError && (
                  <p className="text-xs text-red-600 mt-1">{(uploadGuestResume.error as any)?.response?.data?.error || 'Upload failed'}</p>
                )}
              </div>
            )}

            {/* Resume — authenticated only */}
            {authed && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Resume (PDF)</label>
                {uploadResume.isPending ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner size="sm" /> Uploading…</div>
                ) : resumeSuccess ? (
                  <div className="flex items-center gap-2 text-sm text-green-600"><CheckCircle className="w-4 h-4" /> Uploaded successfully!</div>
                ) : profileData?.profile?.resumePath ? (
                  <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700 truncate">resume.pdf</span>
                      {profileData.profile.resumeText && (
                        <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 flex-shrink-0">extracted ✓</span>
                      )}
                    </div>
                    <label className="cursor-pointer flex-shrink-0 px-3 py-1 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                      Replace
                      <input type="file" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadResume.mutate(f) }} className="hidden" />
                    </label>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border border-dashed border-slate-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors w-fit">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-500">Upload resume PDF</span>
                    <input type="file" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadResume.mutate(f) }} className="hidden" />
                  </label>
                )}
                {uploadResume.isError && (
                  <p className="text-xs text-red-600 mt-1">{(uploadResume.error as any)?.response?.data?.error || 'Upload failed'}</p>
                )}
              </div>
            )}

            {/* Job title searches (up to 3) */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Job Titles (up to 3 — each runs a separate search)</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-500 w-4 text-center">1</span>
                  <AutocompleteInput
                    type="job"
                    value={prefForm.keywords}
                    onChange={(v) => setPrefForm((f) => ({ ...f, keywords: v }))}
                    placeholder="e.g. software engineer"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                {extraSlots >= 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-500 w-4 text-center">2</span>
                    <AutocompleteInput
                      type="job"
                      value={prefForm.keywords2}
                      onChange={(v) => setPrefForm((f) => ({ ...f, keywords2: v }))}
                      placeholder="e.g. frontend developer"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="button" onClick={() => { setPrefForm((f) => ({ ...f, keywords2: f.keywords3, keywords3: '' })); setExtraSlots((s) => s - 1) }} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors" title="Remove">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {extraSlots >= 2 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-500 w-4 text-center">3</span>
                    <AutocompleteInput
                      type="job"
                      value={prefForm.keywords3}
                      onChange={(v) => setPrefForm((f) => ({ ...f, keywords3: v }))}
                      placeholder="e.g. data analyst"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="button" onClick={() => { setPrefForm((f) => ({ ...f, keywords3: '' })); setExtraSlots(1) }} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors" title="Remove">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {extraSlots < 2 && prefForm.keywords && (
                  <button type="button" onClick={() => setExtraSlots((s) => s + 1)} className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium ml-6 mt-1 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                    Add another job title
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Location</label>
                <AutocompleteInput
                  type="location"
                  value={prefForm.location}
                  onChange={(v) => setPrefForm((f) => ({ ...f, location: v }))}
                  placeholder="e.g. San Francisco, CA"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {authed && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Daily Email Time (PST)</label>
                    <input
                      type="time"
                      value={prefForm.dailyEmailTime}
                      onChange={(e) => setPrefForm((f) => ({ ...f, dailyEmailTime: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex items-end pb-0.5">
                    <button
                      type="button"
                      onClick={() => setPrefForm((f) => ({ ...f, emailEnabled: !f.emailEnabled }))}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        prefForm.emailEnabled
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
                          : 'bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 shadow-sm'
                      }`}
                    >
                      {prefForm.emailEnabled ? (
                        <>
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                          </span>
                          Daily Email Active
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Subscribe to Daily Email
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Jobs to scrape <span className="text-slate-400 font-normal">({prefForm.scrapeLimit})</span>
                </label>
                <input type="range" min={20} max={100} step={10} value={prefForm.scrapeLimit}
                  onChange={(e) => setPrefForm((f) => ({ ...f, scrapeLimit: parseInt(e.target.value) }))}
                  className="w-full accent-indigo-600" />
                <div className="relative text-[10px] text-slate-400 mt-0.5 h-4">
                  <span className="absolute left-0">20</span>
                  <span className="absolute" style={{ left: '37.5%', transform: 'translateX(-50%)' }}>50</span>
                  <span className="absolute right-0">100</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Top matches <span className="text-slate-400 font-normal">({prefForm.matchLimit})</span>
                </label>
                <input type="range" min={3} max={20} step={1} value={prefForm.matchLimit}
                  onChange={(e) => setPrefForm((f) => ({ ...f, matchLimit: parseInt(e.target.value) }))}
                  className="w-full accent-indigo-600" />
                <div className="relative text-[10px] text-slate-400 mt-0.5 h-4">
                  <span className="absolute left-0">3</span>
                  <span className="absolute" style={{ left: `${((5 - 3) / 17) * 100}%`, transform: 'translateX(-50%)' }}>5</span>
                  <span className="absolute" style={{ left: `${((10 - 3) / 17) * 100}%`, transform: 'translateX(-50%)' }}>10</span>
                  <span className="absolute right-0">20</span>
                </div>
              </div>
            </div>

            {authed ? (
              <button
                onClick={() => savePreferences.mutate()}
                disabled={savePreferences.isPending}
                className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium rounded-lg hover:from-indigo-700 hover:to-violet-700 shadow-sm hover:shadow-md active:scale-[0.97] disabled:opacity-60 transition-all duration-150 flex items-center gap-2"
              >
                {savePreferences.isPending ? <Spinner size="sm" /> : prefSaved ? <CheckCircle className="w-4 h-4" /> : null}
                {prefSaved ? 'Saved!' : 'Save Settings'}
              </button>
            ) : (
              <p className="text-xs text-slate-400">
                Settings saved in your browser.{' '}
                <button onClick={openSignup} className="text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2">
                  Sign up
                </button>{' '}
                to save them permanently and get daily emails.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Authenticated empty state */}
      {authed && history.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-700 mb-2">No matches yet</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-5">
            Set your keywords and click <strong>Send Now</strong> to get AI-matched jobs from LinkedIn based on your resume.
          </p>
          <button
            onClick={() => setShowSetup(true)}
            className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium rounded-lg hover:from-indigo-700 hover:to-violet-700 shadow-sm active:scale-[0.98] transition-all duration-150"
          >
            Set up keywords
          </button>
        </div>
      )}

      {/* Guest placeholder */}
      {!authed && !guestAlreadySent && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-violet-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-700 mb-2">Your matches will appear here</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-5">
            Fill in your email and job title above, then click <strong>Send My Job Matches</strong>. Upload your resume for more accurate AI matching.
          </p>
          <button onClick={openSignup} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium group inline-flex items-center gap-1">
            Already have an account? Sign in
            <span className="group-hover:translate-x-0.5 transition-transform inline-block">→</span>
          </button>
        </div>
      )}

      {/* Match history — authenticated users */}
      {authed && (
        <div className="space-y-8">
          {history.map((run) => {
            const sections = getSections(run)
            const runTotal = sections.reduce((s, sec) => s + sec.matches.length, 0)
            return (
              <section key={run.id}>
                <div className="flex items-center gap-3 bg-gradient-to-r from-slate-50 to-white border border-slate-200 rounded-xl px-4 py-3 mb-4 shadow-sm">
                  <CalendarDays className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-700">{formatDate(run.runDate)}</span>
                  <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full ml-auto shadow-sm">
                    {runTotal} match{runTotal !== 1 ? 'es' : ''}
                  </span>
                </div>

                <div className="space-y-5">
                  {sections.map((section, si) => (
                    <div key={si}>
                      {section.searchTitle && (
                        <div className="flex items-center gap-2.5 mb-3 mt-1">
                          <span className="text-xs font-bold text-white bg-gradient-to-br from-indigo-500 to-violet-500 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">{si + 1}</span>
                          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">{section.searchTitle}</h3>
                          <div className="flex-1 h-px bg-slate-200" />
                          <span className="text-xs text-slate-400">{section.matches.length} match{section.matches.length !== 1 ? 'es' : ''}</span>
                        </div>
                      )}
                      {section.matches.length === 0 ? (
                        <p className="text-sm text-slate-400 ml-7 mb-2">No matches found for this search</p>
                      ) : (
                        <div className="grid gap-3">
                          {section.matches.map((job, i) => (
                            <div
                              key={i}
                              className={`bg-white rounded-xl border border-slate-200 border-l-4 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${
                                job.compatibility_score != null && job.compatibility_score >= 85
                                  ? 'border-l-emerald-400'
                                  : job.compatibility_score != null && job.compatibility_score >= 65
                                  ? 'border-l-amber-400'
                                  : 'border-l-slate-300'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-3 mb-1">
                                    <a href={job.link} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-1.5">
                                      <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">{job.title}</h3>
                                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 flex-shrink-0 transition-colors" />
                                    </a>
                                    {job.compatibility_score != null && (() => {
                                      const score = (job.compatibility_score / 10).toFixed(1)
                                      return (
                                        <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${
                                          job.compatibility_score >= 85 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                          : job.compatibility_score >= 65 ? 'bg-amber-50 text-amber-700 ring-amber-200'
                                          : 'bg-slate-100 text-slate-600 ring-slate-200'
                                        }`}>{score} / 10</span>
                                      )
                                    })()}
                                  </div>
                                  <div className="flex items-center gap-3 mb-3">
                                    <span className="flex items-center gap-1 text-sm text-slate-600 font-medium">
                                      <Building2 className="w-3.5 h-3.5 text-slate-400" />{job.company}
                                    </span>
                                    {job.location && (
                                      <span className="flex items-center gap-1 text-sm text-slate-500">
                                        <MapPin className="w-3.5 h-3.5 text-slate-400" />{job.location}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm text-slate-600 leading-relaxed">{job.match_rationale}</p>
                                  </div>
                                </div>
                                <QuickApplyButton job={job} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Congrats banner — fixed bottom, shown after guest send completes */}
      {showCongratsBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
          <div className="relative overflow-hidden bg-gradient-to-r from-violet-600 via-pink-500 to-amber-400 rounded-2xl p-5 shadow-2xl">
            {/* Shine overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none" />
            <div className="relative flex items-start gap-3">
              <span className="text-3xl leading-none flex-shrink-0 mt-0.5">🎉</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base leading-snug">Your first JobsClaw email is on its way!</p>
                <p className="text-white/80 text-sm mt-1">
                  Sign up free to get daily AI-matched jobs delivered to your inbox automatically — no setup needed.
                </p>
                <button
                  onClick={() => { setShowCongratsBanner(false); openSignup() }}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-white text-violet-700 font-semibold rounded-lg text-sm hover:bg-white/90 active:scale-[0.97] transition-all duration-150 shadow-sm"
                >
                  Sign up for daily emails →
                </button>
              </div>
              <button onClick={() => setShowCongratsBanner(false)} className="text-white/60 hover:text-white transition-colors flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
