export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 w-36 bg-muted rounded-lg" />
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/30">
          {[100, 140, 80, 80, 60].map((w, i) => (
            <div key={i} className="h-3 bg-muted rounded" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
            <div className="h-9 w-9 bg-muted rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-3 w-48 bg-muted rounded" />
            </div>
            <div className="h-6 w-12 bg-muted rounded-full" />
            <div className="h-4 w-20 bg-muted rounded" />
            <div className="h-4 w-28 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
