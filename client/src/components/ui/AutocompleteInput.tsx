import { useState, useRef, useEffect } from 'react'

const JOB_TITLES = [
  // Engineering
  'Software Engineer', 'Senior Software Engineer', 'Staff Software Engineer',
  'Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer',
  'React Developer', 'React Native Developer', 'Node.js Developer',
  'Python Developer', 'Java Developer', 'TypeScript Developer',
  'iOS Developer', 'Android Developer', 'Mobile Developer',
  'DevOps Engineer', 'Platform Engineer', 'Site Reliability Engineer',
  'Cloud Engineer', 'Infrastructure Engineer', 'Embedded Systems Engineer',
  'Machine Learning Engineer', 'AI Engineer', 'Data Engineer',
  'Data Scientist', 'Data Analyst', 'Business Intelligence Analyst',
  'Security Engineer', 'Cybersecurity Analyst', 'Penetration Tester',
  'QA Engineer', 'Test Automation Engineer', 'SDET',
  // Product & Design
  'Product Manager', 'Senior Product Manager', 'Technical Product Manager',
  'UX Designer', 'UI Designer', 'Product Designer', 'UX Researcher',
  'Graphic Designer', 'Visual Designer', 'Brand Designer',
  // Management
  'Engineering Manager', 'VP of Engineering', 'CTO',
  'Technical Lead', 'Tech Lead', 'Principal Engineer',
  // Other tech
  'Solutions Architect', 'Cloud Architect', 'Enterprise Architect',
  'Scrum Master', 'Agile Coach', 'Project Manager',
  'Technical Writer', 'Developer Advocate', 'Developer Relations',
  // Non-tech
  'Marketing Manager', 'Digital Marketing Specialist', 'SEO Specialist',
  'Content Writer', 'Copywriter', 'Social Media Manager',
  'Sales Engineer', 'Account Executive', 'Sales Development Representative',
  'Customer Success Manager', 'Operations Manager', 'Business Analyst',
  'Financial Analyst', 'Accountant', 'HR Manager', 'Recruiter',
]

const LOCATIONS = [
  // US Cities
  'San Francisco, CA', 'New York, NY', 'Seattle, WA', 'Austin, TX',
  'Boston, MA', 'Los Angeles, CA', 'Chicago, IL', 'Denver, CO',
  'Atlanta, GA', 'Miami, FL', 'Washington, DC', 'San Jose, CA',
  'San Diego, CA', 'Portland, OR', 'Dallas, TX', 'Houston, TX',
  'Philadelphia, PA', 'Phoenix, AZ', 'Minneapolis, MN', 'Detroit, MI',
  'Raleigh, NC', 'Nashville, TN', 'Salt Lake City, UT', 'Las Vegas, NV',
  'Pittsburgh, PA', 'Baltimore, MD', 'Charlotte, NC', 'Columbus, OH',
  // US States / Regions
  'California', 'Texas', 'New York', 'Florida', 'Washington State',
  'United States', 'Remote', 'Remote (US)',
  // International
  'London, UK', 'Toronto, Canada', 'Vancouver, Canada', 'Montreal, Canada',
  'Berlin, Germany', 'Amsterdam, Netherlands', 'Paris, France',
  'Dublin, Ireland', 'Zurich, Switzerland', 'Stockholm, Sweden',
  'Singapore', 'Sydney, Australia', 'Melbourne, Australia',
  'Tokyo, Japan', 'Seoul, South Korea', 'Dubai, UAE',
  'Bangalore, India', 'Mumbai, India', 'Hyderabad, India',
  'Remote (Worldwide)', 'Remote (Europe)', 'Remote (Asia)',
]

function getSuggestions(value: string, list: string[], max = 8): string[] {
  if (!value.trim()) return []
  const lower = value.toLowerCase()
  const startsWith = list.filter((s) => s.toLowerCase().startsWith(lower))
  const contains = list.filter((s) => !s.toLowerCase().startsWith(lower) && s.toLowerCase().includes(lower))
  return [...startsWith, ...contains].slice(0, max)
}

interface Props {
  value: string
  onChange: (v: string) => void
  type: 'job' | 'location'
  placeholder?: string
  className?: string
}

export default function AutocompleteInput({ value, onChange, type, placeholder, className }: Props) {
  const list = type === 'job' ? JOB_TITLES : LOCATIONS
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const suggestions = getSuggestions(value, list)

  useEffect(() => {
    setActiveIdx(-1)
  }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      onChange(suggestions[activeIdx])
      setOpen(false)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={className}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li
              key={s}
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false) }}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                i === activeIdx ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {highlight(s, value)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-indigo-600">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}
