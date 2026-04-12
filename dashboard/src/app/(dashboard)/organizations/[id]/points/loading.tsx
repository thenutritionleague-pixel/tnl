export default function PointsLoading() {
  return (
    <div className="space-y-5 animate-pulse">

      {/* Header + toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-20 bg-muted rounded-md" />
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
        {/* Individual / Team toggle */}
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
          <div className="h-7 w-24 bg-muted rounded-md" />
          <div className="h-7 w-16 bg-muted rounded-md" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl px-4 py-3 space-y-1.5">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-7 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="h-9 flex-1 min-w-44 max-w-xs bg-muted rounded-lg" />
        <div className="h-9 w-32 bg-muted rounded-lg" />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Column header */}
        <div className="grid px-5 py-2.5 border-b border-border bg-muted/30" style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 100px 32px' }}>
          {['Member', 'WK1', 'WK2', 'WK3', 'WK4', 'Total', ''].map((col, i) => (
            <div key={i} className="h-3 bg-muted rounded" style={{ width: col ? '60%' : '100%' }} />
          ))}
        </div>
        {/* Rows */}
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid items-center px-5 py-3" style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 100px 32px' }}>
              {/* Member */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-muted rounded-full shrink-0" />
                <div className="space-y-1">
                  <div className="h-3.5 w-28 bg-muted rounded" />
                  <div className="h-3 w-16 bg-muted rounded" />
                </div>
              </div>
              {/* WK1-4 pills */}
              {[1,2,3,4].map(w => (
                <div key={w} className="flex justify-center">
                  <div className="h-6 w-12 bg-muted rounded-full" />
                </div>
              ))}
              {/* Total */}
              <div className="h-4 w-14 bg-muted rounded justify-self-end" />
              {/* Chevron */}
              <div className="h-5 w-5 bg-muted rounded justify-self-center" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
