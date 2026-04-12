export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse max-w-2xl">
      <div className="h-8 w-28 bg-muted rounded-lg" />
      <div className="bg-card border rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 bg-muted rounded-xl" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-9 w-28 bg-muted rounded-lg" />
          </div>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-10 w-full bg-muted rounded-lg" />
            </div>
          ))}
        </div>
        <div className="h-10 w-28 bg-muted rounded-lg" />
      </div>
    </div>
  )
}
