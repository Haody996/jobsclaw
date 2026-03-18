import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, TrendingUp, Send, Clock, CheckCircle, XCircle, RotateCcw, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import api from '../lib/api'
import Badge from '../components/ui/Badge'
import MatchScoreBadge from '../components/jobs/MatchScoreBadge'
import Spinner from '../components/ui/Spinner'

const STATUS_CONFIG: Record<string, { label: string; variant: any }> = {
  PENDING: { label: 'Pending', variant: 'default' },
  IN_PROGRESS: { label: 'In Progress', variant: 'info' },
  SUBMITTED: { label: 'Submitted', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  INTERVIEWING: { label: 'Interviewing', variant: 'purple' },
  REJECTED: { label: 'Rejected', variant: 'default' },
  OFFER: { label: 'Offer!', variant: 'success' },
}

const MANUAL_STATUSES = ['INTERVIEWING', 'REJECTED', 'OFFER']

export default function Applications() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

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
        ].map(({ key, label, value, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setStatusFilter(key); setPage(1) }}
            className={`bg-white rounded-xl border p-4 text-left transition-all ${
              statusFilter === key ? 'border-indigo-500 shadow-sm' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">{label}</span>
              <Icon className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-xl font-bold text-slate-900">{value}</p>
          </button>
        ))}
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
                  const statusCfg = STATUS_CONFIG[app.status] || { label: app.status, variant: 'default' }
                  return (
                    <tr key={app.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 line-clamp-1">{app.job.title}</span>
                          <a href={app.job.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-indigo-600">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        {app.errorMessage && (
                          <p className="text-xs text-red-500 mt-0.5" title={app.errorMessage}>
                            {app.errorMessage.slice(0, 60)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{app.job.company}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                          {app.status === 'FAILED' && (
                            <button
                              onClick={() => retryApp.mutate(app.id)}
                              disabled={retryApp.isPending}
                              title="Retry"
                              className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 transition-colors"
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
                          onClick={() => deleteApp.mutate(app.id)}
                          className="text-slate-400 hover:text-red-500 text-xs transition-colors"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
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
              className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">Page {page} · {data?.total} total</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(data?.applications?.length || 0) < 20}
              className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
