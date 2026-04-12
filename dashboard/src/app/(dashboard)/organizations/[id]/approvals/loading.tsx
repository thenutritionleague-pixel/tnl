export default function ApprovalsLoading() {
  return (
    <div className="space-y-5 animate-pulse">

      {/* Header */}
      <div className="space-y-1.5">
        <div className="h-8 w-28 bg-muted rounded-md" />
        <div className="h-4 w-48 bg-muted rounded" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-9 flex-1 min-w-44 max-w-xs bg-muted rounded-lg" />
        <div className="h-9 w-32 bg-muted rounded-lg" />
        <div className="h-9 w-36 bg-muted rounded-lg" />
      </div>

      {/* Pending section */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-5 w-16 bg-muted rounded-full" />
        </div>
        <div className="divide-y divide-border">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="w-9 h-9 bg-muted rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 bg-muted rounded" />
                <div className="h-3 w-56 bg-muted rounded" />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="h-6 w-20 bg-muted rounded-full" />
                <div className="h-8 w-20 bg-muted rounded-lg" />
                <div className="h-8 w-20 bg-muted rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reviewed section */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <div className="h-4 w-28 bg-muted rounded" />
        </div>
        <div className="divide-y divide-border">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="w-9 h-9 bg-muted rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-44 bg-muted rounded" />
                <div className="h-3 w-48 bg-muted rounded" />
              </div>
              <div className="h-6 w-20 bg-muted rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
