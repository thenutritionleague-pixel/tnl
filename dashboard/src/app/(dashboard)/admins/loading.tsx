export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-24 bg-muted rounded-lg" />
        <div className="h-4 w-56 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card border rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-muted rounded-lg shrink-0" />
            <div className="space-y-1.5">
              <div className="h-6 w-8 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="h-5 w-36 bg-muted rounded" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
      <div className="bg-card border rounded-xl h-64" />
    </div>
  )
}
