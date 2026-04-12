export default function MembersLoading() {
  return (
    <div className="space-y-5 animate-pulse">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-28 bg-muted rounded-md" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
        <div className="h-8 w-32 bg-muted rounded-lg" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-9 flex-1 min-w-48 max-w-xs bg-muted rounded-lg" />
        <div className="h-9 w-32 bg-muted rounded-lg" />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-muted/30">
          <div className="h-3 w-16 bg-muted rounded flex-1" />
          <div className="h-3 w-20 bg-muted rounded hidden sm:block" style={{ minWidth: 80 }} />
          <div className="h-3 w-16 bg-muted rounded" style={{ minWidth: 80 }} />
          <div className="h-3 w-12 bg-muted rounded" style={{ minWidth: 60 }} />
          <div className="h-3 w-14 bg-muted rounded text-right" style={{ minWidth: 60 }} />
          <div className="h-3 w-12 bg-muted rounded hidden md:block" style={{ minWidth: 60 }} />
          <div className="w-10 shrink-0" />
        </div>
        {/* Rows */}
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              {/* Name */}
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-7 h-7 bg-muted rounded-full shrink-0" />
                <div className="h-4 bg-muted rounded" style={{ width: `${60 + (i * 13) % 50}%` }} />
              </div>
              {/* Email */}
              <div className="h-3.5 w-32 bg-muted rounded hidden sm:block shrink-0" />
              {/* Team */}
              <div className="h-3.5 w-20 bg-muted rounded shrink-0" />
              {/* Role badge */}
              <div className="h-5 w-16 bg-muted rounded-full shrink-0" />
              {/* Points */}
              <div className="h-4 w-10 bg-muted rounded shrink-0" />
              {/* Joined */}
              <div className="h-3.5 w-12 bg-muted rounded hidden md:block shrink-0" />
              {/* Actions */}
              <div className="w-6 h-6 bg-muted rounded shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
