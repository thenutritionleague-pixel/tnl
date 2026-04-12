export default function InviteLoading() {
  return (
    <div className="space-y-5 animate-pulse">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-40 bg-muted rounded-md" />
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
        <div className="h-8 w-24 bg-muted rounded-lg" />
      </div>

      {/* Two-column layout: form left + pending list right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">

        {/* Left: invite form */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 bg-muted rounded" />
            <div className="h-9 bg-muted rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="h-3.5 w-16 bg-muted rounded" />
              <div className="h-9 bg-muted rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3.5 w-12 bg-muted rounded" />
              <div className="h-9 bg-muted rounded-lg" />
            </div>
          </div>
          <div className="h-9 bg-muted rounded-lg" />
        </div>

        {/* Right: pending invites */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <div className="h-4 w-28 bg-muted rounded" />
            <div className="h-5 w-12 bg-muted rounded-full" />
          </div>
          <div className="divide-y divide-border">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex-1 space-y-1">
                  <div className="h-3.5 w-44 bg-muted rounded" />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
                <div className="h-5 w-16 bg-muted rounded-full shrink-0" />
                <div className="h-6 w-6 bg-muted rounded shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Accepted invites */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
        <div className="divide-y divide-border">
          {[1, 2].map(i => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="flex-1 space-y-1">
                <div className="h-3.5 w-40 bg-muted rounded" />
                <div className="h-3 w-28 bg-muted rounded" />
              </div>
              <div className="h-5 w-16 bg-muted rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
