export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-8 w-16 bg-muted rounded-lg mt-1" />
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted rounded-lg" />
          <div className="h-3 w-40 bg-muted rounded" />
        </div>
        <div className="ml-auto flex gap-2 mt-1">
          <div className="h-8 w-14 bg-muted rounded-lg" />
          <div className="h-8 w-8 bg-muted rounded-lg" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-muted rounded-lg shrink-0" />
            <div className="space-y-1.5">
              <div className="h-5 w-10 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border rounded-xl h-72" />
        <div className="space-y-4">
          <div className="bg-card border rounded-xl h-24" />
          <div className="bg-card border rounded-xl h-32" />
          <div className="bg-card border rounded-xl h-20" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-xl h-48" />
    </div>
  )
}
