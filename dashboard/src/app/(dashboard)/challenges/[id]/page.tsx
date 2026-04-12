import Link from "next/link"
import { ArrowLeft, Plus, CalendarDays } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Task = {
  id: string
  week: number
  title: string
  points: number
  status: "active" | "inactive"
}

// Mock challenge data — in a real page this would come from params + DB
const challenge = {
  id: "1",
  title: "April Wellness Challenge",
  description:
    "A month-long challenge designed to build healthy nutrition habits across all teams. Members submit daily proof of completed tasks and earn 🥦 points that contribute to their team leaderboard.",
  startDate: "Apr 1, 2026",
  endDate: "Apr 30, 2026",
  status: "active" as const,
}

const tasks: Task[] = [
  { id: "t1", week: 1, title: "Drink 8 glasses of water", points: 10, status: "active" },
  { id: "t2", week: 1, title: "Walk 10,000 steps", points: 20, status: "active" },
  { id: "t3", week: 2, title: "Eat salad for lunch", points: 15, status: "active" },
  { id: "t4", week: 2, title: "Skip sugar for a day", points: 25, status: "active" },
]

export default function ChallengeDetailPage() {
  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/challenges"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Challenges
      </Link>

      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl text-foreground">{challenge.title}</h1>
            <Badge variant={challenge.status === "active" ? "default" : "secondary"}>
              {challenge.status === "active" ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            <span>
              {challenge.startDate} — {challenge.endDate}
            </span>
          </div>
        </div>
      </div>

      {/* Challenge Info Card */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base font-semibold">Challenge Details</CardTitle>
          <CardDescription>Overview and settings for this challenge.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Description
            </p>
            <p className="text-sm text-foreground leading-relaxed">{challenge.description}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Start Date
              </p>
              <p className="text-sm font-medium text-foreground">{challenge.startDate}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                End Date
              </p>
              <p className="text-sm font-medium text-foreground">{challenge.endDate}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Status
              </p>
              <div className="flex items-center gap-2">
                {/* Status toggle placeholder — interactive in a future update */}
                <div className="relative inline-block w-8 h-4 rounded-full bg-primary cursor-not-allowed opacity-80">
                  <span className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-white shadow" />
                </div>
                <span className="text-sm text-foreground capitalize">{challenge.status}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl text-foreground">Tasks</h2>
          <Link href="#" className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}>
            <Plus className="size-4" />
            Add Task
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Badge variant="outline">Week {task.week}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell className="text-emerald-600 font-medium">
                      🥦 {task.points} pts
                    </TableCell>
                    <TableCell>
                      <Badge variant={task.status === "active" ? "default" : "secondary"}>
                        {task.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
