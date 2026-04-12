export default function ChallengeDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back + header */}
      <div className="space-y-3">
        <div className="h-8 w-32 bg-muted rounded" />
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-64 bg-muted rounded" />
            <div className="h-5 w-16 bg-muted rounded-full" />
          </div>
          <div className="h-4 w-48 bg-muted rounded" />
          <div className="h-4 w-80 bg-muted rounded" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-7 w-10 bg-muted rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Tasks */}
        <div className="lg:col-span-3 space-y-4">
          <div className="h-5 w-16 bg-muted rounded" />
          {[1, 2].map(week => (
            <div key={week} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
                <div className="h-3 w-14 bg-muted rounded" />
              </div>
              {[1, 2, 3].map(i => (
                <div key={i} className="px-4 py-3 flex items-center gap-3 border-b border-border last:border-0">
                  <div className="w-8 h-8 bg-muted rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-36 bg-muted rounded" />
                    <div className="h-3 w-52 bg-muted rounded" />
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="h-4 w-6 bg-muted rounded ml-auto" />
                    <div className="h-3 w-16 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Submissions */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-border">
            <div className="h-5 w-36 bg-muted rounded" />
          </div>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="px-5 py-3 flex items-start gap-3 border-b border-border last:border-0">
              <div className="w-7 h-7 bg-muted rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-24 bg-muted rounded" />
                <div className="h-3 w-32 bg-muted rounded" />
                <div className="h-3 w-16 bg-muted rounded" />
              </div>
              <div className="h-5 w-16 bg-muted rounded-full mt-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
