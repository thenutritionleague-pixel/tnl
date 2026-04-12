import { GripVertical, Pencil, Trash2, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"

type Policy = {
  id: string
  order: number
  title: string
  preview: string
  active: boolean
}

const policies: Policy[] = [
  {
    id: "pol1",
    order: 1,
    title: "Submission Guidelines",
    preview:
      "All task submissions must include photographic proof taken on the day of completion. Retroactive photos will not be accepted. Submissions close at midnight of the same day.",
    active: true,
  },
  {
    id: "pol2",
    order: 2,
    title: "Points & Scoring Rules",
    preview:
      "Points are awarded only upon admin approval. Duplicate submissions will be rejected and may result in a point deduction. Bonus points for weekly streaks are applied every Monday.",
    active: true,
  },
  {
    id: "pol3",
    order: 3,
    title: "Team Conduct Policy",
    preview:
      "All team members are expected to maintain a positive and respectful environment. Toxic behaviour, harassment, or unsportsmanlike conduct may result in disqualification.",
    active: true,
  },
  {
    id: "pol4",
    order: 4,
    title: "Privacy & Data Policy",
    preview:
      "Submitted photos and personal data are used solely for the purposes of this league. Data will not be shared with third parties and will be deleted 30 days after the league ends.",
    active: false,
  },
]

export default function PoliciesPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground">Policies</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage league rules and guidelines shown to members.
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="size-4" />
          Add Policy
        </Button>
      </div>

      {/* Policies List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
        {policies.map((policy, idx) => (
          <div
            key={policy.id}
            className={`flex items-start gap-4 px-4 py-4 group hover:bg-muted/40 transition-colors ${
              idx === 0 ? "rounded-t-xl" : ""
            } ${idx === policies.length - 1 ? "rounded-b-xl" : ""}`}
          >
            {/* Drag handle */}
            <div className="shrink-0 mt-0.5 text-muted-foreground/40 group-hover:text-muted-foreground cursor-grab transition-colors">
              <GripVertical className="size-5" />
            </div>

            {/* Order number */}
            <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
              {policy.order}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {policy.title}
                </h2>
                {!policy.active && (
                  <Badge variant="secondary" className="text-xs">
                    Inactive
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {policy.preview}
              </p>
            </div>

            {/* Controls */}
            <div className="shrink-0 flex items-center gap-3">
              <Switch
                defaultChecked={policy.active}
                aria-label={`Toggle ${policy.title}`}
              />
              <Separator orientation="vertical" className="h-6" />
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Pencil className="size-3.5" />
                <span className="sr-only">Edit</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5" />
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Drag rows to reorder how policies appear to members. Toggle the switch to show or hide individual policies.
      </p>
    </div>
  )
}
