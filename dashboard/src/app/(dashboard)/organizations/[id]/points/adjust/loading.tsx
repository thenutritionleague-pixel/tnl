export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse max-w-2xl">
      <div className="space-y-2">
        <div className="h-8 w-52 bg-muted rounded-lg" />
        <div className="h-3 w-72 bg-muted rounded" />
      </div>
      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-9 w-full bg-muted rounded-lg" />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <div className="h-9 w-20 bg-muted rounded-lg" />
          <div className="h-9 w-28 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  )
}
