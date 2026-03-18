interface FiltersState {
  datePosted: string
  jobType: string
  remote: boolean
  minScore: string
  sources: string[]
}

interface JobFiltersProps {
  filters: FiltersState
  onChange: (filters: FiltersState) => void
}

const DATE_OPTIONS = [
  { value: 'all', label: 'Any time' },
  { value: 'today', label: 'Last 24 hours' },
  { value: '3days', label: 'Last 3 days' },
  { value: 'week', label: 'Last week' },
  { value: 'month', label: 'Last month' },
]

const JOB_TYPES = [
  { value: '', label: 'All types' },
  { value: 'FULLTIME', label: 'Full-time' },
  { value: 'PARTTIME', label: 'Part-time' },
  { value: 'CONTRACTOR', label: 'Contract' },
  { value: 'INTERN', label: 'Internship' },
]

const SOURCES = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'glassdoor', label: 'Glassdoor' },
  { value: 'direct', label: 'Direct / Other' },
]

export default function JobFilters({ filters, onChange }: JobFiltersProps) {
  function update(key: keyof FiltersState, value: any) {
    onChange({ ...filters, [key]: value })
  }

  function toggleSource(value: string) {
    const current = filters.sources
    const next = current.includes(value)
      ? current.filter((s) => s !== value)
      : [...current, value]
    update('sources', next)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5 sticky top-4">
      <h3 className="font-semibold text-slate-900 text-sm">Filters</h3>

      {/* Source */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-2">Source</label>
        <div className="space-y-1.5">
          {SOURCES.map((src) => (
            <label key={src.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.sources.includes(src.value)}
                onChange={() => toggleSource(src.value)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm text-slate-600">{src.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Date posted */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-2">Date Posted</label>
        <div className="space-y-1.5">
          {DATE_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="datePosted"
                value={opt.value}
                checked={filters.datePosted === opt.value}
                onChange={() => update('datePosted', opt.value)}
                className="accent-indigo-600"
              />
              <span className="text-sm text-slate-600">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Job type */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-2">Job Type</label>
        <select
          value={filters.jobType}
          onChange={(e) => update('jobType', e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {JOB_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Remote */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.remote}
            onChange={(e) => update('remote', e.target.checked)}
            className="w-4 h-4 accent-indigo-600"
          />
          <span className="text-sm font-medium text-slate-700">Remote only</span>
        </label>
      </div>

      {/* Min match score */}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-2">
          Min Match Score: {filters.minScore ? `${filters.minScore}%` : 'Any'}
        </label>
        <input
          type="range"
          min="0"
          max="90"
          step="10"
          value={filters.minScore || '0'}
          onChange={(e) => update('minScore', e.target.value === '0' ? '' : e.target.value)}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>Any</span>
          <span>90%</span>
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={() => onChange({ datePosted: 'all', jobType: '', remote: false, minScore: '', sources: [] })}
        className="w-full text-sm text-indigo-600 hover:text-indigo-800 font-medium py-1"
      >
        Reset filters
      </button>
    </div>
  )
}
