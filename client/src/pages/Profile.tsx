import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Plus, Trash2, FileText, CheckCircle, Eye, EyeOff, Mail, Send } from 'lucide-react'
import api from '../lib/api'
import Spinner from '../components/ui/Spinner'
import AutocompleteInput from '../components/ui/AutocompleteInput'

const DEFAULT_QUESTIONS = [
  'Are you legally authorized to work in the US?',
  'Do you require visa sponsorship now or in the future?',
  'Years of relevant experience?',
  'Expected annual salary?',
  'Are you willing to relocate?',
  'What is your notice period / earliest start date?',
  'Do you have a disability or require accommodation?',
]

export default function Profile() {
  const queryClient = useQueryClient()
  const [resumeDragging, setResumeDragging] = useState(false)
  const [resumeSuccess, setResumeSuccess] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newAnswer, setNewAnswer] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [autofilled, setAutofilled] = useState(false)
  const [showLinkedInPassword, setShowLinkedInPassword] = useState(false)
  const [digestSaved, setDigestSaved] = useState(false)
  const [digestJobId, setDigestJobId] = useState<string | null>(null)
  const [prefForm, setPrefForm] = useState({
    keywords: '',
    location: '',
    dailyEmailTime: '09:00',
    emailEnabled: false,
  })
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', address: '',
    city: '', state: '', zip: '', country: 'US', linkedinUrl: '', portfolioUrl: '', bio: '',
    linkedinEmail: '', linkedinPassword: '',
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
      setDigestSaved(true)
      setTimeout(() => setDigestSaved(false), 2000)
    },
  })

  const triggerDigest = useMutation({
    mutationFn: () => api.post('/preferences/trigger'),
    onSuccess: ({ data }) => {
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
      if (state === 'completed' || state === 'failed') return false
      return 2000
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await api.get('/profile')
      if (data.profile) {
        setForm({
          firstName: data.profile.firstName || '',
          lastName: data.profile.lastName || '',
          phone: data.profile.phone || '',
          address: data.profile.address || '',
          city: data.profile.city || '',
          state: data.profile.state || '',
          zip: data.profile.zip || '',
          country: data.profile.country || 'US',
          linkedinUrl: data.profile.linkedinUrl || '',
          portfolioUrl: data.profile.portfolioUrl || '',
          bio: data.profile.bio || '',
          linkedinEmail: data.profile.linkedinEmail || '',
          linkedinPassword: data.profile.linkedinPassword || '',
        })
      }
      return data
    },
  })

  const saveProfile = useMutation({
    mutationFn: () => api.put('/profile', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setProfileSaved(true)
      setAutofilled(false)
      setTimeout(() => setProfileSaved(false), 2000)
    },
  })

  const uploadResume = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('resume', file)
      return api.post('/profile/resume', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setResumeSuccess(true)
      setTimeout(() => setResumeSuccess(false), 3000)
      // Auto-fill empty form fields from parsed resume
      if (data.parsed && Object.keys(data.parsed).length > 0) {
        setForm((f) => {
          const updated = { ...f }
          let changed = false
          for (const [key, value] of Object.entries(data.parsed) as [string, string][]) {
            if (value && !(updated as any)[key]) {
              ;(updated as any)[key] = value
              changed = true
            }
          }
          if (changed) setAutofilled(true)
          return updated
        })
      }
    },
  })

  const addAnswer = useMutation({
    mutationFn: () => api.post('/profile/answers', { question: newQuestion, answer: newAnswer }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setNewQuestion('')
      setNewAnswer('')
    },
  })

  const deleteAnswer = useMutation({
    mutationFn: (id: string) => api.delete(`/profile/answers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  })

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setResumeDragging(false)
      const file = e.dataTransfer.files[0]
      if (file?.type === 'application/pdf') uploadResume.mutate(file)
    },
    [uploadResume]
  )

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadResume.mutate(file)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  const profile = data?.profile
  const answers = data?.answers || []

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Your Profile</h1>

      {/* Resume Upload */}
      <section className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <h2 className="font-semibold text-slate-900 mb-3">Resume</h2>

        {uploadResume.isPending ? (
          <div className="flex items-center gap-3 px-1 py-2">
            <Spinner size="sm" />
            <span className="text-sm text-slate-500">Uploading and extracting text…</span>
          </div>
        ) : resumeSuccess ? (
          <div className="flex items-center gap-2 text-green-600 px-1 py-2">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Uploaded successfully!</span>
          </div>
        ) : profile?.resumePath ? (
          /* Compact row when resume exists */
          <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <span className="text-sm font-medium text-slate-700 truncate">resume.pdf</span>
              {profile.resumeText && (
                <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 flex-shrink-0">
                  extracted ✓
                </span>
              )}
            </div>
            <label className="cursor-pointer flex-shrink-0 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
              Replace
              <input type="file" accept=".pdf" onChange={handleFileInput} className="hidden" />
            </label>
          </div>
        ) : (
          /* Drag-drop zone when no resume */
          <div
            onDragOver={(e) => { e.preventDefault(); setResumeDragging(true) }}
            onDragLeave={() => setResumeDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              resumeDragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'
            }`}
          >
            <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-500 mb-2">Drop your resume PDF here, or</p>
            <label className="cursor-pointer text-sm text-indigo-600 hover:underline font-medium">
              Browse file
              <input type="file" accept=".pdf" onChange={handleFileInput} className="hidden" />
            </label>
          </div>
        )}

        {uploadResume.isError && (
          <p className="text-sm text-red-600 mt-2">{(uploadResume.error as any)?.response?.data?.error || 'Upload failed'}</p>
        )}
      </section>

      {/* Personal Info */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Personal Information</h2>
          {autofilled && (
            <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-3 py-1">
              ✦ Auto-filled from resume — review and save
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'First Name', key: 'firstName' },
            { label: 'Last Name', key: 'lastName' },
            { label: 'Phone', key: 'phone' },
            { label: 'Country', key: 'country' },
            { label: 'Address', key: 'address' },
            { label: 'City', key: 'city' },
            { label: 'State', key: 'state' },
            { label: 'ZIP Code', key: 'zip' },
            { label: 'LinkedIn URL', key: 'linkedinUrl' },
            { label: 'Portfolio URL', key: 'portfolioUrl' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">{label}</label>
              <input
                type="text"
                value={(form as any)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ))}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Bio / Summary</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>
        <button
          onClick={() => saveProfile.mutate()}
          disabled={saveProfile.isPending}
          className="mt-4 px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-2"
        >
          {saveProfile.isPending ? <Spinner size="sm" /> : profileSaved ? <CheckCircle className="w-4 h-4" /> : null}
          {profileSaved ? 'Saved!' : 'Save Profile'}
        </button>
      </section>

      {/* LinkedIn Credentials */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-1">LinkedIn Easy Apply</h2>
        <p className="text-sm text-slate-500 mb-4">
          Required for auto-applying to LinkedIn jobs with Easy Apply. Credentials are stored locally and only used by the apply worker.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">LinkedIn Email</label>
            <input
              type="email"
              value={form.linkedinEmail}
              onChange={(e) => setForm((f) => ({ ...f, linkedinEmail: e.target.value }))}
              placeholder="your@email.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">LinkedIn Password</label>
            <div className="relative">
              <input
                type={showLinkedInPassword ? 'text' : 'password'}
                value={form.linkedinPassword}
                onChange={(e) => setForm((f) => ({ ...f, linkedinPassword: e.target.value }))}
                placeholder="••••••••"
                className="w-full px-3 py-2 pr-9 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowLinkedInPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showLinkedInPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <p className="text-xs text-amber-600 mt-3">
          Note: LinkedIn may require 2FA verification on first login. If that happens, the worker will fail with a checkpoint error — run the worker manually once to resolve it.
        </p>
        <button
          onClick={() => saveProfile.mutate()}
          disabled={saveProfile.isPending}
          className="mt-4 px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-2"
        >
          {saveProfile.isPending ? <Spinner size="sm" /> : profileSaved ? <CheckCircle className="w-4 h-4" /> : null}
          {profileSaved ? 'Saved!' : 'Save Profile'}
        </button>
      </section>

      {/* Daily Job Digest */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Mail className="w-5 h-5 text-indigo-500" />
          <h2 className="font-semibold text-slate-900">Daily Job Digest</h2>
        </div>
        <p className="text-sm text-slate-500 mb-5">
          Receive a daily email with the top 5 AI-matched jobs scraped from LinkedIn, based on your
          resume and search preferences.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Job Keywords</label>
            <AutocompleteInput
              type="job"
              value={prefForm.keywords}
              onChange={(v) => setPrefForm((f) => ({ ...f, keywords: v }))}
              placeholder="e.g. software engineer, react developer"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
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
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Send Email At (PST)
            </label>
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
                className={`relative w-11 h-6 rounded-full transition-colors ${
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
                {prefForm.emailEnabled ? 'Digest enabled' : 'Digest disabled'}
              </span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => savePreferences.mutate()}
            disabled={savePreferences.isPending}
            className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {savePreferences.isPending ? (
              <Spinner size="sm" />
            ) : digestSaved ? (
              <CheckCircle className="w-4 h-4" />
            ) : null}
            {digestSaved ? 'Saved!' : 'Save Preferences'}
          </button>

          <button
            onClick={() => { setDigestJobId(null); triggerDigest.mutate() }}
            disabled={triggerDigest.isPending || !!digestJobId && digestProgress?.state !== 'completed' && digestProgress?.state !== 'failed' || !prefForm.keywords}
            title={!prefForm.keywords ? 'Set keywords first' : 'Send digest now'}
            className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Send Now
          </button>

          {triggerDigest.isError && (
            <span className="text-sm text-red-600">
              {(triggerDigest.error as any)?.response?.data?.error || 'Failed to queue digest'}
            </span>
          )}
        </div>

        {digestJobId && digestProgress && (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">
                {digestProgress.state === 'failed' ? '✗ Failed' : digestProgress.progress?.step || 'Queued…'}
              </span>
              {digestProgress.progress && (
                <span className="text-xs text-slate-500">{digestProgress.progress.percent}%</span>
              )}
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  digestProgress.state === 'failed' ? 'bg-red-500' :
                  digestProgress.state === 'completed' ? 'bg-green-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${digestProgress.progress?.percent ?? 0}%` }}
              />
            </div>
            {digestProgress.progress?.detail && (
              <p className="text-xs text-slate-500">{digestProgress.progress.detail}</p>
            )}
            {digestProgress.state === 'completed' && (
              <button onClick={() => setDigestJobId(null)} className="text-xs text-slate-400 hover:text-slate-600 mt-1">Dismiss</button>
            )}
          </div>
        )}

        <p className="text-xs text-slate-400 mt-3">
          Requires <code>ANTHROPIC_API_KEY</code> and SMTP settings in your server's <code>.env</code>.
          The sourcing worker must be running: <code>npm run sourcing-worker</code>
        </p>
      </section>

      {/* Q&A Bank */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Common Questions & Answers</h2>
        <p className="text-sm text-slate-500 mb-5">
          These answers will be used to automatically fill application forms.
        </p>

        {/* Existing answers */}
        <div className="space-y-3 mb-6">
          {answers.map((qa: any) => (
            <div key={qa.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{qa.question}</p>
                  <p className="text-sm text-slate-600 mt-1">{qa.answer}</p>
                </div>
                <button
                  onClick={() => deleteAnswer.mutate(qa.id)}
                  className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {answers.length === 0 && (
            <p className="text-sm text-slate-400 italic">No answers yet. Add some below.</p>
          )}
        </div>

        {/* Add new answer */}
        <div className="border border-dashed border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Add Answer</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Question</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="e.g. Are you authorized to work in the US?"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  onChange={(e) => setNewQuestion(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
                  value=""
                >
                  <option value="">Common questions...</option>
                  {DEFAULT_QUESTIONS.filter((q) => !answers.find((a: any) => a.question === q)).map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Answer</label>
              <input
                type="text"
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                placeholder="Your answer"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={() => addAnswer.mutate()}
              disabled={!newQuestion || !newAnswer || addAnswer.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Answer
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
