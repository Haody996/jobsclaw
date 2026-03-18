interface MatchScoreBadgeProps {
  score: number | null
}

export default function MatchScoreBadge({ score }: MatchScoreBadgeProps) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-slate-400">No resume</span>
  }

  const color =
    score >= 70
      ? 'bg-green-100 text-green-700 border-green-200'
      : score >= 40
        ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
        : 'bg-red-100 text-red-700 border-red-200'

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}
      title="Keyword match score between job description and your resume"
    >
      {score}% match
    </span>
  )
}
