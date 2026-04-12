export default function AdminsLoading() {
  return (
    <div className="space-y-6 animate-pulse">

      {/* Header */}
      <div className="space-y-1.5">
        <div className="h-8 w-20 bg-muted rounded-md" />
        <div className="h-4 w-60 bg-muted rounded" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">

        {/* Left: admin list */}
        <div className="space-y-4">
          {/* Org Admin card */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-muted rounded" />
                <div className="h-4 w-24 bg-muted rounded" />
              </div>
              <div className="h-3.5 w-40 bg-muted rounded" />
            </div>
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-muted rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-44 bg-muted rounded" />
              </div>
              <div className="h-6 w-20 bg-muted rounded-full shrink-0" />
            </div>
          </div>

          {/* Sub admins card */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-muted rounded" />
                <div className="h-4 w-24 bg-muted rounded" />
              </div>
              <div className="h-3.5 w-12 bg-muted rounded" />
            </div>
            <div className="px-5 py-2 bg-muted/30">
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
            <div className="flex items-center gap-3 px-5 py-3.5 border-t border-border">
              <div className="w-9 h-9 bg-muted rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-52 bg-muted rounded" />
              </div>
              <div className="h-5 w-14 bg-muted rounded-full shrink-0" />
              <div className="h-6 w-6 bg-muted rounded shrink-0" />
            </div>
            <div className="flex items-center gap-3 px-5 py-3.5 border-t border-border">
              <div className="w-9 h-9 bg-muted rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-28 bg-muted rounded" />
                <div className="h-3 w-48 bg-muted rounded" />
              </div>
              <div className="h-5 w-14 bg-muted rounded-full shrink-0" />
              <div className="h-6 w-6 bg-muted rounded shrink-0" />
            </div>
            <div className="px-5 py-2 bg-muted/30 border-t border-border">
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
            <div className="flex items-center gap-3 px-5 py-3.5 border-t border-border">
              <div className="w-9 h-9 bg-muted rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-36 bg-muted rounded" />
                <div className="h-3 w-44 bg-muted rounded" />
              </div>
              <div className="h-5 w-14 bg-muted rounded-full shrink-0" />
              <div className="h-6 w-6 bg-muted rounded shrink-0" />
            </div>
          </div>
        </div>

        {/* Right: add form */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-muted rounded" />
            <div className="h-4 w-28 bg-muted rounded" />
          </div>
          <div className="h-3.5 w-full bg-muted rounded" />
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="h-3.5 w-20 bg-muted rounded" />
              <div className="h-9 bg-muted rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3.5 w-28 bg-muted rounded" />
              <div className="h-9 bg-muted rounded-lg" />
            </div>
          </div>
          <div className="h-9 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  )
}
