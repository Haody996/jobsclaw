import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Sparkles, MapPin, Building2, CalendarDays, Inbox } from 'lucide-react'
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

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-6 h-6 text-indigo-500" />
            <h1 className="text-2xl font-bold text-slate-900">AI Job Matches</h1>
          </div>
          <p className="text-sm text-slate-500">
            Jobs matched to your resume by AI — updated daily based on your preferences
          </p>
        </div>
        {totalJobs > 0 && (
          <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
            {totalJobs} jobs across {history.length} run{history.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Empty state */}
      {history.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-700 mb-2">No matches yet</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Upload your resume and enable the Daily Job Digest in your Profile to start receiving
            AI-matched jobs.
          </p>
          <a
            href="/profile"
            className="inline-block mt-5 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Set up Daily Digest
          </a>
        </div>
      )}

      {/* Match runs */}
      <div className="space-y-8">
        {history.map((run) => (
          <section key={run.id}>
            {/* Run header */}
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-600">{formatDate(run.runDate)}</span>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {run.topMatches.length} match{run.topMatches.length !== 1 ? 'es' : ''}
              </span>
            </div>

            {/* Job cards */}
            <div className="grid gap-3">
              {run.topMatches.map((job, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Title + link */}
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

                      {/* Company + location */}
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

                      {/* Match rationale */}
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-slate-600 leading-relaxed">{job.match_rationale}</p>
                      </div>
                    </div>

                    {/* Apply button */}
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
