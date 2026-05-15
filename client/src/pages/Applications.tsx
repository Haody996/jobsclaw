import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, TrendingUp, Send, Clock, CheckCircle, XCircle, RotateCcw, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import api from '../lib/api'
import Badge from '../components/ui/Badge'
import MatchScoreBadge from '../components/jobs/MatchScoreBadge'
import Spinner from '../components/ui/Spinner'

const STATUS_CONFIG: Record<string, { label: string; variant: any }> = {
  PENDING: { label: 'Queued', variant: 'default' },
  IN_PROGRESS: { label: 'Applying…', variant: 'info' },
  SUBMITTED: { label: 'Submitted', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  INTERVIEWING: { label: 'Interviewing', variant: 'purple' },
  REJECTED: { label: 'Rejected', variant: 'default' },
  OFFER: { label: 'Offer!', variant: 'success' },
}

const MANUAL_STATUSES = ['INTERVIEWING', 'REJECTED', 'OFFER']

function StatusProgress({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, variant: 'default' }
  const isActive = status === 'PENDING' || status === 'IN_PROGRESS'
  const isDone = status === 'SUBMITTED' || status === 'OFFER'
  const isFail = status === 'FAILED' || status === 'REJECTED'

  return (
    <div className="flex flex-col gap-1.5 min-w-[100px]">
      <Badge variant={cfg.variant}>{cfg.label}</Badge>
      <div className="h-1 rounded-full bg-slate-100 overflow-hidden relative">
        {isActive ? (
          <div
            className={`absolute inset-y-0 rounded-full animate-indeterminate ${
              status === 'PENDING'
                ? 'bg-gradient-to-r from-transparent via-slate-400 to-transparent'
                : 'bg-gradient-to-r from-transparent via-indigo-500 to-transparent'
            }`}
          />
        ) : (
          <div
            className={`h-full ${
              isDone ? 'bg-emerald-500 w-full' : isFail ? 'bg-red-500 w-full' : 'bg-slate-300 w-full'
            }`}
          />
        )}
      </div>
    </div>
  )
}

export default function Applications() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['applications', statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (statusFilter) params.set('status', statusFilter)
      const { data } = await api.get(`/applications?${params}`)
      return data
    },
    refetchInterval: 5000, // Poll every 5s for pending/in-progress updates
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/applications/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  })

  const deleteApp = useMutation({
    mutationFn: (id: string) => api.delete(`/applications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  })

  const retryApp = useMutation({
    mutationFn: (id: string) => api.post(`/applications/${id}/retry`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  })

  const stats = data?.stats || {}
  const total = Object.values(stats).reduce((a: any, b: any) => a + b, 0)

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Applications</h1>
        <p className="text-slate-500">Track all your job applications</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { key: '', label: 'All', value: total as number, icon: Send },
          { key: 'SUBMITTED', label: 'Submitted', value: stats.SUBMITTED || 0, icon: CheckCircle },
          { key: 'INTERVIEWING', label: 'Interviews', value: stats.INTERVIEWING || 0, icon: TrendingUp },
          { key: 'PENDING', label: 'Pending', value: (stats.PENDING || 0) + (stats.IN_PROGRESS || 0), icon: Clock },
          { key: 'FAILED', label: 'Failed', value: stats.FAILED || 0, icon: XCircle },
        ].map(({ key, label, value, icon: Icon }) => {
          const active = statusFilter === key
          return (
            <button
              key={key}
              onClick={() => { setStatusFilter(key); setPage(1) }}
              className={`rounded-xl border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 ${
                active
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-500 border-transparent shadow-md shadow-indigo-200/50'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${active ? 'text-indigo-100' : 'text-slate-500'}`}>{label}</span>
                <Icon className={`w-4 h-4 ${active ? 'text-white/80' : 'text-slate-400'}`} />
              </div>
              <p className={`text-xl font-bold ${active ? 'text-white' : 'text-slate-900'}`}>{value}</p>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-3 font-medium text-slate-600">Job</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Company</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Match</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Applied</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Update</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Spinner />
                  </td>
                </tr>
              ) : data?.applications?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    No applications found
                  </td>
                </tr>
              ) : (
                data?.applications?.map((app: any) => {
                  return (
                    <React.Fragment key={app.id}>
                    <tr
                      className={`border-b border-slate-100 transition-colors ${app.errorMessage ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50'}`}
                      onClick={() => app.errorMessage && setExpandedId(expandedId === app.id ? null : app.id)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 line-clamp-1">{app.job.title}</span>
                          <a href={app.job.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-slate-400 hover:text-indigo-600">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        {app.errorMessage && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <p className="text-xs text-red-500 line-clamp-1 flex-1">
                              {app.errorMessage}
                            </p>
                            {expandedId === app.id
                              ? <ChevronUp className="w-3 h-3 text-red-400 flex-shrink-0" />
                              : <ChevronDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                            }
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{app.job.company}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <StatusProgress status={app.status} />
                          {app.status === 'FAILED' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); retryApp.mutate(app.id) }}
                              disabled={retryApp.isPending}
                              title="Retry"
                              className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 transition-colors flex-shrink-0"
                            >
                              {retryApp.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <MatchScoreBadge score={app.matchScore} />
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                        {formatDistanceToNow(new Date(app.appliedAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3.5">
                        <select
                          value=""
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => e.target.value && updateStatus.mutate({ id: app.id, status: e.target.value })}
                          className="text-xs border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                        >
                          <option value="">Update...</option>
                          {MANUAL_STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteApp.mutate(app.id) }}
                          className="text-slate-400 hover:text-red-500 text-xs transition-colors"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                    {expandedId === app.id && app.errorMessage && (
                      <tr className="bg-red-50 border-b border-red-100">
                        <td colSpan={7} className="px-5 py-3">
                          <p className="text-xs font-semibold text-red-600 mb-1">Error details</p>
                          <pre className="text-xs text-red-700 whitespace-pre-wrap break-words font-mono bg-red-100 rounded-lg px-3 py-2 leading-relaxed">{app.errorMessage}</pre>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(data?.total || 0) > 20 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] disabled:opacity-40 transition-all duration-150"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">Page {page} · {data?.total} total</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(data?.applications?.length || 0) < 20}
              className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] disabled:opacity-40 transition-all duration-150"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
