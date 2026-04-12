export default function ChallengesLoading() {
  return (
    <div className="space-y-5 animate-pulse">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-8 w-32 bg-muted rounded-md" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-8 w-36 bg-muted rounded-lg" />
      </div>

      {/* Challenge accordion cards */}
      <div className="space-y-3">
        {[72, 56, 80, 64].map((titleW, i) => (
          <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Challenge header row */}
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-muted rounded-lg shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 bg-muted rounded" style={{ width: `${titleW * 2}px` }} />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-6 w-16 bg-muted rounded-full" />
                <div className="h-6 w-6 bg-muted rounded" />
              </div>
            </div>

            {/* Expanded tasks (first card only) */}
            {i === 0 && (
              <div className="border-t border-border px-5 py-3 space-y-2.5">
                {[1, 2, 3].map(j => (
                  <div key={j} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 bg-muted rounded-lg shrink-0" />
                      <div className="space-y-1">
                        <div className="h-3.5 w-36 bg-muted rounded" />
                        <div className="h-3 w-24 bg-muted rounded" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-12 bg-muted rounded-full" />
                      <div className="h-6 w-6 bg-muted rounded" />
                    </div>
                  </div>
                ))}
                <div className="h-8 w-28 bg-muted rounded-lg mt-1" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
