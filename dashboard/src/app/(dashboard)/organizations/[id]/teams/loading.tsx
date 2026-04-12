export default function TeamsLoading() {
  return (
    <div className="space-y-5 animate-pulse">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-20 bg-muted rounded-md" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
        <div className="h-8 w-28 bg-muted rounded-lg" />
      </div>

      {/* Team cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[4, 3, 5, 4, 3, 4].map((memberCount, i) => (
          <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Team header */}
            <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-muted rounded-lg shrink-0" />
                <div className="space-y-1">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-20 bg-muted rounded" />
                </div>
              </div>
              <div className="h-7 w-7 bg-muted rounded-lg shrink-0" />
            </div>

            {/* Members list */}
            <div className="divide-y divide-border">
              {Array.from({ length: memberCount }).map((_, j) => (
                <div key={j} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="w-7 h-7 bg-muted rounded-full shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3.5 bg-muted rounded" style={{ width: `${50 + Math.random() * 40}%` }} />
                  </div>
                  <div className="h-5 w-14 bg-muted rounded-full shrink-0" />
                  <div className="h-6 w-6 bg-muted rounded shrink-0" />
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <div className="h-7 w-16 bg-muted rounded-lg" />
              <div className="h-4 w-20 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
