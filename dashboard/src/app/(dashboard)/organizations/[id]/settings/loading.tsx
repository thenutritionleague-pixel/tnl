export default function SettingsLoading() {
  return (
    <div className="space-y-5 animate-pulse">

      {/* Header */}
      <div className="space-y-1.5">
        <div className="h-8 w-24 bg-muted rounded-md" />
        <div className="h-4 w-56 bg-muted rounded" />
      </div>

      {/* Settings form card */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-5 max-w-2xl">
        {/* Org name */}
        <div className="space-y-1.5">
          <div className="h-3.5 w-32 bg-muted rounded" />
          <div className="h-9 bg-muted rounded-lg" />
        </div>
        {/* Country + Timezone */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="h-3.5 w-20 bg-muted rounded" />
            <div className="h-9 bg-muted rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 bg-muted rounded" />
            <div className="h-9 bg-muted rounded-lg" />
          </div>
        </div>
        {/* Status toggle */}
        <div className="space-y-1.5">
          <div className="h-3.5 w-16 bg-muted rounded" />
          <div className="h-9 w-40 bg-muted rounded-lg" />
        </div>
        {/* Divider */}
        <div className="h-px bg-muted" />
        {/* Save button */}
        <div className="flex justify-end">
          <div className="h-9 w-28 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  )
}
