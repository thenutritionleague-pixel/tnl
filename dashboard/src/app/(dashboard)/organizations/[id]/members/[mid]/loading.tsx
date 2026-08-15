export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-8 w-16 bg-muted rounded-lg mt-1" />
        <div className="space-y-2">
          <div className="h-8 w-56 bg-muted rounded-lg" />
          <div className="h-3 w-40 bg-muted rounded" />
        </div>
        <div className="ml-auto flex gap-2 mt-1">
          <div className="h-8 w-20 bg-muted rounded-lg" />
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="h-3 w-20 bg-muted rounded" />
            <div className="h-6 w-12 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-muted rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-muted rounded" style={{ width: `${50 + (i * 11) % 40}%` }} />
              <div className="h-3 w-28 bg-muted rounded" />
            </div>
            <div className="h-6 w-16 bg-muted rounded-lg shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
