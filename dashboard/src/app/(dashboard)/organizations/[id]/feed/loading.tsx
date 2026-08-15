export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-40 bg-muted rounded-md" />
          <div className="h-4 w-56 bg-muted rounded" />
        </div>
        <div className="h-8 w-32 bg-muted rounded-lg" />
      </div>

      {/* Rows */}
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="px-5 py-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-muted rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-muted rounded" style={{ width: `${45 + (i * 13) % 45}%` }} />
              <div className="h-3 w-32 bg-muted rounded" />
            </div>
            <div className="h-5 w-14 bg-muted rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
