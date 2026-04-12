export default function Loading() {
  return (
    <div className="max-w-2xl space-y-6 animate-pulse">
      <div className="h-8 w-16 bg-muted rounded-lg" />
      <div className="space-y-2">
        <div className="h-8 w-56 bg-muted rounded-lg" />
        <div className="h-4 w-72 bg-muted rounded" />
      </div>
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="h-5 w-40 bg-muted rounded" />
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="w-10 h-10 bg-muted rounded-lg" />
          ))}
        </div>
        <div className="h-10 bg-muted rounded-lg" />
        <div className="h-10 bg-muted rounded-lg" />
      </div>
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="h-5 w-24 bg-muted rounded" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-10 bg-muted rounded-lg" />
          <div className="h-10 bg-muted rounded-lg" />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <div className="h-9 w-20 bg-muted rounded-lg" />
        <div className="h-9 w-40 bg-muted rounded-lg" />
      </div>
    </div>
  )
}
