import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Sparkles, MapPin, Building2, CalendarDays, Inbox, Send, CheckCircle, Settings2, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../lib/api'
import Spinner from '../components/ui/Spinner'

interface JobMatch {
  company: string
  title: string
  link: string
  location: string
  match_rationale: string
}

interface MatchRun {
  id: string
  runDate: string
  jobLinks: string[]
  topMatches: JobMatch[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function Matches() {
  const queryClient = useQueryClient()
  const [showSetup, setShowSetup] = useState(false)
  const [prefSaved, setPrefSaved] = useState(false)
  const [digestJobId, setDigestJobId] = useState<string | null>(null)
  const [prefForm, setPrefForm] = useState({
    keywords: '',
    location: '',
    dailyEmailTime: '09:00',
    emailEnabled: false,
  })

  useQuery({
    queryKey: ['preferences'],
    queryFn: async () => {
      const { data } = await api.get('/preferences')
      if (data.preference) {
        setPrefForm({
          keywords: data.preference.keywords || '',
          location: data.preference.location || '',
          dailyEmailTime: data.preference.dailyEmailTime || '09:00',
          emailEnabled: data.preference.emailEnabled ?? false,
        })
      }
      return data
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
    mutationFn: async () => {
      await api.put('/preferences', prefForm)
      return api.post('/preferences/trigger')
    },
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
      setDigestJobId(data.jobId)
    },
  })

  const { data: digestProgress } = useQuery({
    queryKey: ['digestProgress', digestJobId],
    queryFn: async () => {
      const { data } = await api.get(`/preferences/trigger/${digestJobId}`)
      return data as { state: string; progress: { step: string; percent: number; detail?: string } | null }
    },
    enabled: !!digestJobId,
    refetchInterval: (query) => {
      const state = query.state.data?.state
      if (state === 'completed' || state === 'failed') {
        if (state === 'completed') queryClient.invalidateQueries({ queryKey: ['matches'] })
        return false
      }
      return 2000
    },
  })

  const { data, isLoading } = useQuery<{ history: MatchRun[] }>({
    queryKey: ['matches'],
    queryFn: async () => {
      const { data } = await api.get('/matches')
      return data
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  const history = data?.history ?? []
  const totalJobs = history.reduce((sum, run) => sum + run.topMatches.length, 0)
  const isRunning = !!digestJobId && digestProgress?.state !== 'completed' && digestProgress?.state !== 'failed'

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-6 h-6 text-indigo-500" />
            <h1 className="text-2xl font-bold text-slate-900">AI Job Matches</h1>
          </div>
          <p className="text-sm text-slate-500">
            Jobs matched to your resume by AI — based on your search preferences
          </p>
        </div>
        {totalJobs > 0 && (
          <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
            {totalJobs} jobs across {history.length} run{history.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Setup + Send panel */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6 overflow-hidden">
        {/* Always-visible action bar */}
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => { setDigestJobId(null); triggerDigest.mutate() }}
            disabled={isRunning || triggerDigest.isPending || !prefForm.keywords}
            title={!prefForm.keywords ? 'Set keywords first — click Setup' : 'Run AI matching now'}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isRunning || triggerDigest.isPending ? <Spinner size="sm" /> : <Send className="w-4 h-4" />}
            {isRunning ? 'Running…' : 'Send Now'}
          </button>

          {prefForm.keywords ? (
            <span className="text-sm text-slate-600 truncate flex-1">
              <span className="font-medium">{prefForm.keywords}</span>
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
        {digestJobId && digestProgress && (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700">
                {digestProgress.state === 'failed' ? '✗ Failed' : digestProgress.progress?.step || 'Queued…'}
              </span>
              {digestProgress.progress && (
                <span className="text-xs text-slate-500">{digestProgress.progress.percent}%</span>
              )}
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  digestProgress.state === 'failed' ? 'bg-red-500' :
                  digestProgress.state === 'completed' ? 'bg-green-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${digestProgress.progress?.percent ?? 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              {digestProgress.progress?.detail && (
                <p className="text-xs text-slate-500">{digestProgress.progress.detail}</p>
              )}
              {(digestProgress.state === 'completed' || digestProgress.state === 'failed') && (
                <button onClick={() => setDigestJobId(null)} className="text-xs text-slate-400 hover:text-slate-600 ml-auto">
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
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Job Keywords</label>
                <input
                  type="text"
                  value={prefForm.keywords}
                  onChange={(e) => setPrefForm((f) => ({ ...f, keywords: e.target.value }))}
                  placeholder="e.g. software engineer, react developer"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Location</label>
                <input
                  type="text"
                  value={prefForm.location}
                  onChange={(e) => setPrefForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. San Francisco, CA"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Daily Email Time (UTC)</label>
                <input
                  type="time"
                  value={prefForm.dailyEmailTime}
                  onChange={(e) => setPrefForm((f) => ({ ...f, dailyEmailTime: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setPrefForm((f) => ({ ...f, emailEnabled: !f.emailEnabled }))}
                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                      prefForm.emailEnabled ? 'bg-indigo-600' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        prefForm.emailEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-700">
                    {prefForm.emailEnabled ? 'Daily email on' : 'Daily email off'}
                  </span>
                </label>
              </div>
            </div>
            <button
              onClick={() => savePreferences.mutate()}
              disabled={savePreferences.isPending}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-2"
            >
              {savePreferences.isPending ? <Spinner size="sm" /> : prefSaved ? <CheckCircle className="w-4 h-4" /> : null}
              {prefSaved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {history.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-700 mb-2">No matches yet</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-5">
            Set your keywords and click <strong>Send Now</strong> to get AI-matched jobs from LinkedIn based on your resume.
          </p>
          <button
            onClick={() => setShowSetup(true)}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Set up keywords
          </button>
        </div>
      )}

      {/* Match runs */}
      <div className="space-y-8">
        {history.map((run) => (
          <section key={run.id}>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-600">{formatDate(run.runDate)}</span>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {run.topMatches.length} match{run.topMatches.length !== 1 ? 'es' : ''}
              </span>
            </div>

            <div className="grid gap-3">
              {run.topMatches.map((job, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <a
                        href={job.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-1.5 mb-1"
                      >
                        <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                          {job.title}
                        </h3>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 flex-shrink-0 transition-colors" />
                      </a>

                      <div className="flex items-center gap-3 mb-3">
                        <span className="flex items-center gap-1 text-sm text-slate-600 font-medium">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {job.company}
                        </span>
                        {job.location && (
                          <span className="flex items-center gap-1 text-sm text-slate-500">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {job.location}
                          </span>
                        )}
                      </div>

                      <div className="flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-slate-600 leading-relaxed">{job.match_rationale}</p>
                      </div>
                    </div>

                    <a
                      href={job.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Apply
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
