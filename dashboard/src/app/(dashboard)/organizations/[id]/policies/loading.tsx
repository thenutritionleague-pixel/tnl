export default function PoliciesLoading() {
  return (
    <div className="space-y-5 animate-pulse">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-24 bg-muted rounded-md" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-8 w-28 bg-muted rounded-lg" />
      </div>

      {/* Policy cards */}
      <div className="space-y-3">
        {[80, 60, 90, 70, 55].map((w, i) => (
          <div key={i} className="bg-card border border-border rounded-xl px-5 py-4 flex items-start gap-4">
            {/* Drag handle + number */}
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              <div className="w-4 h-4 bg-muted rounded" />
              <div className="w-6 h-6 bg-muted rounded-full" />
            </div>
            {/* Content */}
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded" style={{ width: `${w}%` }} />
              <div className="h-3.5 bg-muted rounded w-5/6" />
              <div className="h-3.5 bg-muted rounded" style={{ width: `${w - 15}%` }} />
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="h-7 w-7 bg-muted rounded-lg" />
              <div className="h-7 w-7 bg-muted rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
