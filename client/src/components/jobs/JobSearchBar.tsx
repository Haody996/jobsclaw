import { useState } from 'react'
import { Search, MapPin } from 'lucide-react'

interface JobSearchBarProps {
  initialQuery?: string
  initialLocation?: string
  onSearch: (query: string, location: string) => void
  loading?: boolean
}

export default function JobSearchBar({ initialQuery = '', initialLocation = '', onSearch, loading }: JobSearchBarProps) {
  const [query, setQuery] = useState(initialQuery)
  const [location, setLocation] = useState(initialLocation)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSearch(query, location)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Job title, keywords..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
        />
      </div>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white w-44"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
      >
        {loading ? 'Searching...' : 'Search'}
      </button>
    </form>
  )
}
