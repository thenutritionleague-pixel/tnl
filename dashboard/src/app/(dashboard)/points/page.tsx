"use client"

import { useState } from "react"
import { SlidersHorizontal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type PointType = "Auto" | "Manual"

type PointEntry = {
  id: string
  memberName: string
  memberInitials: string
  avatarColor: string
  amount: number
  reason: string
  type: PointType
  date: string
}

const pointsHistory: PointEntry[] = [
  {
    id: "p1",
    memberName: "Arjun Shah",
    memberInitials: "AS",
    avatarColor: "bg-violet-100 text-violet-700",
    amount: 20,
    reason: "Walk 10,000 steps — approved",
    type: "Auto",
    date: "Apr 6, 2026",
  },
  {
    id: "p2",
    memberName: "Priya Mehta",
    memberInitials: "PM",
    avatarColor: "bg-pink-100 text-pink-700",
    amount: 15,
    reason: "Drink 8 glasses of water — approved",
    type: "Auto",
    date: "Apr 6, 2026",
  },
  {
    id: "p3",
    memberName: "Rahul Nair",
    memberInitials: "RN",
    avatarColor: "bg-sky-100 text-sky-700",
    amount: -10,
    reason: "Duplicate submission reversal",
    type: "Manual",
    date: "Apr 5, 2026",
  },
  {
    id: "p4",
    memberName: "Sneha Patel",
    memberInitials: "SP",
    avatarColor: "bg-amber-100 text-amber-700",
    amount: 25,
    reason: "Nutrition Quiz #1 — perfect score",
    type: "Auto",
    date: "Apr 5, 2026",
  },
  {
    id: "p5",
    memberName: "Vikram Rao",
    memberInitials: "VR",
    avatarColor: "bg-emerald-100 text-emerald-700",
    amount: 50,
    reason: "Bonus: Weekly streak milestone",
    type: "Manual",
    date: "Apr 4, 2026",
  },
  {
    id: "p6",
    memberName: "Kavya Krishnan",
    memberInitials: "KK",
    avatarColor: "bg-rose-100 text-rose-700",
    amount: 20,
    reason: "Skip sugar for a day — approved",
    type: "Auto",
    date: "Apr 4, 2026",
  },
  {
    id: "p7",
    memberName: "Ananya Iyer",
    memberInitials: "AI",
    avatarColor: "bg-teal-100 text-teal-700",
    amount: 30,
    reason: "Weekend Walk Challenge — completed",
    type: "Auto",
    date: "Apr 3, 2026",
  },
  {
    id: "p8",
    memberName: "Rohan Desai",
    memberInitials: "RD",
    avatarColor: "bg-orange-100 text-orange-700",
    amount: -20,
    reason: "Points correction — admin review",
    type: "Manual",
    date: "Apr 3, 2026",
  },
  {
    id: "p9",
    memberName: "Arjun Shah",
    memberInitials: "AS",
    avatarColor: "bg-violet-100 text-violet-700",
    amount: 25,
    reason: "Hydration Quiz — completed",
    type: "Auto",
    date: "Apr 2, 2026",
  },
  {
    id: "p10",
    memberName: "Priya Mehta",
    memberInitials: "PM",
    avatarColor: "bg-pink-100 text-pink-700",
    amount: 100,
    reason: "Referral bonus — manual award",
    type: "Manual",
    date: "Apr 1, 2026",
  },
]

const tabs = ["All", "Auto-awarded", "Manual"] as const
type Tab = (typeof tabs)[number]

const stats = [
  { label: "Total Awarded", value: "🥦 12,480" },
  { label: "Manual Adjustments", value: "🥦 320" },
  { label: "Avg per Member", value: "🥦 260" },
]

export default function PointsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("All")

  const filtered = pointsHistory.filter((p) => {
    if (activeTab === "Auto-awarded") return p.type === "Auto"
    if (activeTab === "Manual") return p.type === "Manual"
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground">
            Points History
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track all point awards and manual adjustments.
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-white">
          <SlidersHorizontal className="size-4" />
          Manual Adjustment
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-card border border-border rounded-xl px-5 py-4"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              {s.label}
            </p>
            <p className="text-xl font-semibold text-emerald-600">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${entry.avatarColor}`}
                    >
                      {entry.memberInitials}
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {entry.memberName}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={`text-sm font-semibold ${
                      entry.amount >= 0
                        ? "text-emerald-600"
                        : "text-destructive"
                    }`}
                  >
                    🥦 {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs">
                  {entry.reason}
                </TableCell>
                <TableCell>
                  {entry.type === "Auto" ? (
                    <Badge variant="secondary">Auto</Badge>
                  ) : (
                    <Badge className="bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-100">
                      Manual
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {entry.date}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
