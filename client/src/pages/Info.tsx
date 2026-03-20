import { useNavigate } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { Sparkles, Mail, Search, CheckCircle, ArrowRight, Zap, Shield, Clock } from 'lucide-react'

function NavBar() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-md border-b border-white/10">
      <button onClick={() => navigate('/info')} className="flex items-center gap-2">
        <img src="/icon.png" alt="JobsClaw" className="w-8 h-8" />
        <span className="font-bold text-xl text-white">JobsClaw</span>
      </button>
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/login', { state: { backgroundLocation: location } })}
          className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-colors"
        >
          Log in
        </button>
        <button
          onClick={() => navigate('/register', { state: { backgroundLocation: location } })}
          className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Get started
        </button>
      </div>
    </nav>
  )
}

const steps = [
  {
    icon: Search,
    step: '01',
    title: 'Set your job preferences',
    desc: 'Tell JobsClaw what roles you want — keywords like "React Developer" or "Product Manager" and your preferred location.',
  },
  {
    icon: Sparkles,
    step: '02',
    title: 'AI filters the noise',
    desc: 'Every day, JobsClaw scrapes fresh listings and uses Gemini AI to score and rank the top 5 jobs against your resume.',
  },
  {
    icon: Mail,
    step: '03',
    title: 'Get your digest in your inbox',
    desc: 'A curated email lands every morning with your top matches — title, company, location, and why each job fits you.',
  },
]

const features = [
  {
    icon: Zap,
    title: 'Daily AI matching',
    desc: 'Gemini 2.5 Flash analyzes your resume against 50+ fresh listings every single day — so you never miss the right opportunity.',
  },
  {
    icon: Search,
    title: 'Live LinkedIn scraping',
    desc: 'Jobs posted in the last 24 hours, pulled directly from LinkedIn search — no stale listings, no recycled boards.',
  },
  {
    icon: Mail,
    title: 'Smart morning digest',
    desc: 'One email at your chosen time each morning. Your top 5 matches with match rationale, apply links, and nothing else.',
  },
  {
    icon: CheckCircle,
    title: 'Match history',
    desc: 'Every digest you\'ve received is saved in your AI Matches tab — browse past matches and track your application pipeline.',
  },
  {
    icon: Clock,
    title: 'Set it and forget it',
    desc: 'Configure once and your digest runs automatically every day. No login required, no manual searching.',
  },
  {
    icon: Shield,
    title: 'Your resume stays private',
    desc: 'Your resume is used only to match jobs — it\'s never shared, indexed, or sold. Your job search is yours alone.',
  },
]

const stats = [
  { value: '50+', label: 'jobs scraped daily' },
  { value: '5', label: 'top matches per digest' },
  { value: '24h', label: 'max job listing age' },
  { value: '100%', label: 'AI-powered ranking' },
]

export default function Info() {
  const navigate = useNavigate()
  const location = useLocation()

  function openRegister() {
    navigate('/register', { state: { backgroundLocation: location } })
  }

  return (
    <div className="bg-black text-white min-h-screen font-sans">
      <NavBar />

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 pt-40 pb-28 overflow-hidden">
        {/* Glow */}
        <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-400 text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          Powered by Gemini 2.5 Flash AI
        </div>

        <h1 className="relative text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] max-w-4xl mb-6">
          Stop scrolling.<br />
          <span className="text-blue-400">Start landing.</span>
        </h1>

        <p className="relative text-lg md:text-xl text-white/60 max-w-2xl mb-10 leading-relaxed">
          JobsClaw scrapes LinkedIn daily, ranks the best jobs against your resume using AI,
          and delivers your top 5 matches straight to your inbox — every morning.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={openRegister}
            className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors text-base"
          >
            Get started free
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3.5 text-white/60 hover:text-white font-medium text-base transition-colors"
          >
            Browse jobs →
          </button>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="border-y border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-white/10">
          {stats.map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <span className="text-3xl md:text-4xl font-bold text-blue-400">{value}</span>
              <span className="text-sm text-white/50 mt-1">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">How it works</p>
          <h2 className="text-3xl md:text-5xl font-bold">Three steps to your dream job</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map(({ icon: Icon, step, title, desc }) => (
            <div key={step} className="relative bg-white/5 border border-white/10 rounded-2xl p-7 hover:border-blue-500/40 hover:bg-white/8 transition-all group">
              <div className="absolute top-6 right-6 text-5xl font-black text-white/5 group-hover:text-blue-500/10 transition-colors select-none">{step}</div>
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center mb-5">
                <Icon className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature highlight ── */}
      <section className="border-t border-white/10 bg-gradient-to-b from-white/5 to-transparent">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-3xl md:text-5xl font-bold">Everything you need.<br />Nothing you don't.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-blue-500/30 transition-all">
                <div className="w-9 h-9 rounded-lg bg-blue-600/15 flex items-center justify-center mb-4">
                  <Icon className="w-4.5 h-4.5 text-blue-400 w-5 h-5" />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sample email preview ── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">Daily digest</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Your morning job report</h2>
            <p className="text-white/50 leading-relaxed mb-6">
              Every morning at your chosen time, you'll receive a clean email with your 5 best job matches —
              complete with company, location, and an AI-written explanation of why each job fits your background.
            </p>
            <button onClick={openRegister} className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors text-sm">
              Start receiving your digest
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Mock email card */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-white/10">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">JC</div>
              <div>
                <p className="text-sm font-medium">JobsClaw Daily Digest</p>
                <p className="text-xs text-white/40">Today at 9:00 AM PST</p>
              </div>
            </div>
            <p className="text-sm text-white/60">Your top 5 matches for <span className="text-white font-medium">"React Developer"</span> in <span className="text-white font-medium">Los Angeles, CA</span></p>
            {[
              { title: 'Senior Frontend Engineer', company: 'Stripe', match: '98%' },
              { title: 'React Developer', company: 'Figma', match: '95%' },
              { title: 'UI Engineer', company: 'Vercel', match: '91%' },
            ].map(({ title, company, match }) => (
              <div key={title} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-white/40">{company}</p>
                </div>
                <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded-lg">{match}</span>
              </div>
            ))}
            <p className="text-xs text-white/30 text-center pt-1">+ 2 more matches in full email</p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative border-t border-white/10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 via-black to-black pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-6 py-28 text-center">
          <h2 className="text-4xl md:text-6xl font-bold mb-5">
            Your next job is<br />
            <span className="text-blue-400">already out there.</span>
          </h2>
          <p className="text-white/50 text-lg mb-10">
            Let AI find it for you. Set up in under 2 minutes.
          </p>
          <button
            onClick={openRegister}
            className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors text-lg"
          >
            Get started free
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/icon.png" alt="JobsClaw" className="w-6 h-6" />
            <span className="font-bold text-sm text-white/70">JobsClaw</span>
          </div>
          <p className="text-xs text-white/30">© {new Date().getFullYear()} JobsClaw. Built to help you land faster.</p>
          <button onClick={() => navigate('/')} className="text-xs text-white/40 hover:text-white/70 transition-colors">
            Open app →
          </button>
        </div>
      </footer>
    </div>
  )
}
