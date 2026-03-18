import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Send, Clock, CheckCircle, Bot, ExternalLink } from 'lucide-react'
import api from '../lib/api'
import { isAuthenticated } from '../lib/auth'
import { useApplyMode } from '../lib/apply-mode'
import JobCard, { type Job } from '../components/jobs/JobCard'
import JobSearchBar from '../components/jobs/JobSearchBar'
import Spinner from '../components/ui/Spinner'

export default function Dashboard() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('software engineer')
  const [location, setLocation] = useState('Los Angeles')
  const { mode, setMode } = useApplyMode()

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['dashboard-jobs', query, location],
    queryFn: async () => {
      const params = new URLSearchParams({ q: query, page: '1' })
      if (location) params.set('location', location)
      const { data } = await api.get(`/jobs?${params}`)
      return data
    },
  })

  const { data: statsData } = useQuery({
    queryKey: ['application-stats'],
    enabled: isAuthenticated(),
    queryFn: async () => {
      const { data } = await api.get('/applications?limit=1')
      return data.stats
    },
  })

  function handleSearch(q: string, loc: string) {
    setQuery(q || 'software engineer')
    setLocation(loc)
  }

  function handleSearchNavigate(q: string, loc: string) {
    const params = new URLSearchParams({ q: q || 'software engineer' })
    if (loc) params.set('location', loc)
    navigate(`/jobs?${params}`)
  }

  const stats = statsData || {}
  const total = Object.values(stats).reduce((a: any, b: any) => a + b, 0)
  const submitted = (stats.SUBMITTED || 0) + (stats.INTERVIEWING || 0) + (stats.OFFER || 0)
  const pending = (stats.PENDING || 0) + (stats.IN_PROGRESS || 0)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Dashboard</h1>
        <p className="text-slate-500">Find and apply to jobs automatically</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Applied', value: total, icon: Send, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Submitted', value: submitted, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
          { label: 'In Progress', value: pending, icon: Clock, color: 'text-blue-600 bg-blue-50' },
          { label: 'Interviews', value: stats.INTERVIEWING || 0, icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-500">{label}</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{value as number}</p>
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Quick Search</h2>
        <div className="flex gap-3">
          <div className="flex-1">
            <JobSearchBar
              initialQuery={query}
              initialLocation={location}
              onSearch={handleSearch}
              loading={jobsLoading}
            />
          </div>
          <button
            onClick={() => handleSearchNavigate(query, location)}
            className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            Advanced Search
          </button>
        </div>

        {/* Quick filter chips */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {['Remote', 'Full-time', 'Last 24h', 'San Francisco', 'New York'].map((chip) => (
            <button
              key={chip}
              onClick={() => {
                if (chip === 'Remote') navigate('/jobs?remote=true')
                else if (chip === 'Full-time') navigate('/jobs?jobType=FULLTIME')
                else if (chip === 'Last 24h') navigate('/jobs?datePosted=today')
                else navigate(`/jobs?location=${encodeURIComponent(chip)}`)
              }}
              className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Featured jobs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Recommended Jobs</h2>
          <div className="flex items-center gap-3">
            {/* Apply mode toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 text-xs font-medium">
              <button
                onClick={() => setMode('auto')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  mode === 'auto' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Bot className="w-3.5 h-3.5" /> Auto Apply
              </button>
              <button
                onClick={() => setMode('tab')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  mode === 'tab' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5" /> New Tab
              </button>
            </div>
            <button
              onClick={() => navigate('/jobs')}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              View all →
            </button>
          </div>
        </div>

        {jobsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : jobsData?.jobs?.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p>No jobs found. Try a different search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {(jobsData?.jobs || []).slice(0, 9).map((job: Job) => (
              <JobCard key={job.id} job={job} applyMode={mode} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
