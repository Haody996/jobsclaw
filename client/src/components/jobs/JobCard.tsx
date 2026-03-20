import { MapPin, Building2, Clock, Wifi, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import MatchScoreBadge from './MatchScoreBadge'
import Badge from '../ui/Badge'

export interface Job {
  id: string
  title: string
  company: string
  location: string | null
  source: string
  url: string
  salary: string | null
  jobType: string | null
  isRemote: boolean
  postedAt: string | null
  matchScore: number | null
  application: { id: string; status: string } | null
}

interface JobCardProps {
  job: Job
}

const SOURCE_COLORS: Record<string, string> = {
  linkedin: 'info',
  indeed: 'warning',
  glassdoor: 'success',
  default: 'default',
}

export default function JobCard({ job }: JobCardProps) {
  const sourceLower = job.source?.toLowerCase() || 'default'
  const sourceColor = (SOURCE_COLORS[sourceLower] || 'default') as any

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="group/link inline-flex items-start gap-1 hover:text-indigo-700 transition-colors"
          >
            <h3 className="font-semibold text-slate-900 text-sm leading-snug group-hover:text-indigo-700 transition-colors line-clamp-2">
              {job.title}
            </h3>
            <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0 text-slate-300 group-hover/link:text-indigo-500 transition-colors" />
          </a>
          <div className="flex items-center gap-1.5 mt-1">
            <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-sm text-slate-600 truncate">{job.company}</span>
          </div>
        </div>
        <Badge variant={sourceColor} className="flex-shrink-0">
          {job.source}
        </Badge>
      </div>

      <div className="space-y-1.5 mb-4">
        {job.location && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{job.location}</span>
            {job.isRemote && (
              <span className="flex items-center gap-1 ml-1 text-green-600 font-medium">
                <Wifi className="w-3 h-3" /> Remote
              </span>
            )}
          </div>
        )}
        {job.salary && (
          <div className="text-xs text-slate-600 font-medium">{job.salary}</div>
        )}
        {job.postedAt && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(job.postedAt), { addSuffix: true })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <MatchScoreBadge score={job.matchScore} />
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Apply
        </a>
      </div>
    </div>
  )
}
