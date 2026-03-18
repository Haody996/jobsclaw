import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import JobCard, { type Job } from '../components/jobs/JobCard'
import JobFilters from '../components/jobs/JobFilters'
import JobSearchBar from '../components/jobs/JobSearchBar'
import Spinner from '../components/ui/Spinner'

interface FiltersState {
  datePosted: string
  jobType: string
  remote: boolean
  minScore: string
  sources: string[]
}

export default function Jobs() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || 'software engineer')
  const [location, setLocation] = useState(searchParams.get('location') || 'Los Angeles')
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<FiltersState>({
    datePosted: searchParams.get('datePosted') || 'all',
    jobType: searchParams.get('jobType') || '',
    remote: searchParams.get('remote') === 'true',
    minScore: searchParams.get('minScore') || '',
    sources: searchParams.get('sources') ? searchParams.get('sources')!.split(',') : [],
  })

  // Sync URL params
  useEffect(() => {
    const params: Record<string, string> = { q: query }
    if (location) params.location = location
    if (filters.datePosted !== 'all') params.datePosted = filters.datePosted
    if (filters.jobType) params.jobType = filters.jobType
    if (filters.remote) params.remote = 'true'
    if (filters.minScore) params.minScore = filters.minScore
    if (filters.sources.length) params.sources = filters.sources.join(',')
    setSearchParams(params)
  }, [query, location, filters])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['jobs', query, location, filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        q: location ? `${query} in ${location}` : query,
        page: String(page),
        datePosted: filters.datePosted,
      })
      if (filters.jobType) params.set('jobType', filters.jobType)
      if (filters.remote) params.set('remote', 'true')
      if (filters.minScore) params.set('minScore', filters.minScore)
      const { data } = await api.get(`/jobs?${params}`)
      return data
    },
    placeholderData: (prev) => prev,
  })

  function handleSearch(q: string, loc: string) {
    setQuery(q || 'software engineer')
    setLocation(loc)
    setPage(1)
  }

  const allJobs: Job[] = data?.jobs || []
  const jobs = filters.sources.length
    ? allJobs.filter((j) => {
        const src = j.source?.toLowerCase() || ''
        return filters.sources.some((s) => {
          if (s === 'direct') return src !== 'linkedin' && src !== 'indeed' && src !== 'glassdoor'
          return src.includes(s)
        })
      })
    : allJobs
  const loading = isLoading || isFetching

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Find Jobs</h1>
        <JobSearchBar
          initialQuery={query}
          initialLocation={location}
          onSearch={handleSearch}
          loading={loading}
        />
      </div>

      <div className="flex gap-6">
        {/* Sidebar filters */}
        <div className="w-56 flex-shrink-0">
          <JobFilters
            filters={filters}
            onChange={(f) => {
              setFilters(f)
              setPage(1)
            }}
          />
        </div>

        {/* Job list */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              {loading ? 'Searching...' : `${jobs.length} jobs found`}
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Spinner size="lg" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-24 text-slate-500">
              <p className="font-medium">No jobs found</p>
              <p className="text-sm mt-1">Try different keywords or filters</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-500">Page {page}</span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={jobs.length < 10 || loading}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
