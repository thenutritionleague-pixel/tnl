export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded-lg" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-9 w-40 bg-muted rounded-lg" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card border rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-muted rounded-lg" />
            <div className="space-y-2">
              <div className="h-6 w-12 bg-muted rounded" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card border rounded-xl overflow-hidden">
            <div className="p-5 flex items-start gap-4 border-b">
              <div className="w-12 h-12 bg-muted rounded-xl" />
              <div className="space-y-2 flex-1">
                <div className="h-5 w-40 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-1">
                  <div className="h-3 w-16 bg-muted rounded" />
                  <div className="h-4 w-24 bg-muted rounded" />
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t flex justify-between">
              <div className="h-3 w-28 bg-muted rounded" />
              <div className="h-8 w-20 bg-muted rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
