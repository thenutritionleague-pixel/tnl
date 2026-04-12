import { Camera } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type ApprovalStatus = "pending" | "approved" | "rejected"

type Approval = {
  id: string
  memberName: string
  memberInitials: string
  team: string
  task: string
  week: number
  submittedAt: string
  status: ApprovalStatus
  points?: number
}

const approvals: Approval[] = [
  {
    id: "a1",
    memberName: "Arjun Shah",
    memberInitials: "AS",
    team: "Team Alpha",
    task: "Drink 8 glasses of water",
    week: 1,
    submittedAt: "Apr 6, 2026 at 9:14 AM",
    status: "pending",
  },
  {
    id: "a2",
    memberName: "Priya Mehta",
    memberInitials: "PM",
    team: "Team Beta",
    task: "Walk 10,000 steps",
    week: 1,
    submittedAt: "Apr 6, 2026 at 8:52 AM",
    status: "approved",
    points: 20,
  },
  {
    id: "a3",
    memberName: "Rahul Nair",
    memberInitials: "RN",
    team: "Team Gamma",
    task: "Eat salad for lunch",
    week: 2,
    submittedAt: "Apr 5, 2026 at 7:30 PM",
    status: "pending",
  },
  {
    id: "a4",
    memberName: "Sneha Patel",
    memberInitials: "SP",
    team: "Team Alpha",
    task: "Skip sugar for a day",
    week: 2,
    submittedAt: "Apr 5, 2026 at 6:45 PM",
    status: "rejected",
  },
  {
    id: "a5",
    memberName: "Vikram Rao",
    memberInitials: "VR",
    team: "Team Delta",
    task: "Walk 10,000 steps",
    week: 2,
    submittedAt: "Apr 5, 2026 at 5:20 PM",
    status: "pending",
  },
  {
    id: "a6",
    memberName: "Kavya Krishnan",
    memberInitials: "KK",
    team: "Team Gamma",
    task: "Drink 8 glasses of water",
    week: 1,
    submittedAt: "Apr 5, 2026 at 4:10 PM",
    status: "pending",
  },
]

const avatarColors: Record<string, string> = {
  AS: "bg-violet-100 text-violet-700",
  PM: "bg-pink-100 text-pink-700",
  RN: "bg-sky-100 text-sky-700",
  SP: "bg-amber-100 text-amber-700",
  VR: "bg-emerald-100 text-emerald-700",
  KK: "bg-rose-100 text-rose-700",
}

function ApprovalCard({ approval }: { approval: Approval }) {
  const isPending = approval.status === "pending"
  const isApproved = approval.status === "approved"
  const isRejected = approval.status === "rejected"

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-col gap-4 p-4">
        {/* Member info */}
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
              avatarColors[approval.memberInitials] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {approval.memberInitials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {approval.memberName}
            </p>
            <p className="text-xs text-muted-foreground">{approval.team}</p>
          </div>
        </div>

        {/* Task + week */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground">{approval.task}</p>
            <Badge variant="outline">Week {approval.week}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{approval.submittedAt}</p>
        </div>

        {/* Proof image placeholder */}
        <div className="relative w-full h-28 rounded-lg bg-muted flex flex-col items-center justify-center gap-2">
          <Camera className="size-5 text-muted-foreground" />
          <Button variant="outline" size="xs">
            View Proof
          </Button>
        </div>

        {/* Status / Action area */}
        {isApproved && (
          <Badge variant="default" className="self-start bg-emerald-600 text-white">
            Approved — 🥦 {approval.points} pts
          </Badge>
        )}

        {isRejected && (
          <Badge variant="destructive" className="self-start">
            Rejected
          </Badge>
        )}

        {isPending && (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Approve ✓
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
            >
              Reject ✗
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ApprovalsPage() {
  const pending = approvals.filter((a) => a.status === "pending")
  const approved = approvals.filter((a) => a.status === "approved")
  const rejected = approvals.filter((a) => a.status === "rejected")

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground">Approvals</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Review member-submitted task proofs and award points.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Badge variant="outline">{approvals.length} Total</Badge>
          <Badge className="bg-amber-100 text-amber-700 border-amber-200">
            {pending.length} Pending
          </Badge>
        </div>
      </div>

      {/* Filter tabs (static — interactive in a future update) */}
      <div className="flex items-center gap-1 border-b border-border">
        {[
          { label: "All", count: approvals.length, active: true },
          { label: "Pending", count: pending.length, active: false },
          { label: "Approved", count: approved.length, active: false },
          { label: "Rejected", count: rejected.length, active: false },
        ].map((tab) => (
          <button
            key={tab.label}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab.active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            <span
              className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${
                tab.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {approvals.map((approval) => (
          <ApprovalCard key={approval.id} approval={approval} />
        ))}
      </div>
    </div>
  )
}
