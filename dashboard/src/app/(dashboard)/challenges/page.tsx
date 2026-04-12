import Link from "next/link"
import { Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Challenge = {
  id: string
  title: string
  tasks: number
  startDate: string
  endDate: string
  status: "active" | "inactive"
}

const challenges: Challenge[] = [
  {
    id: "1",
    title: "April Wellness Challenge",
    tasks: 8,
    startDate: "Apr 1, 2026",
    endDate: "Apr 30, 2026",
    status: "active",
  },
  {
    id: "2",
    title: "March Fitness Sprint",
    tasks: 6,
    startDate: "Mar 1, 2026",
    endDate: "Mar 31, 2026",
    status: "inactive",
  },
  {
    id: "3",
    title: "Hydration Week",
    tasks: 4,
    startDate: "Feb 14, 2026",
    endDate: "Feb 21, 2026",
    status: "inactive",
  },
]

export default function ChallengesPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground">Challenges</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage all nutrition challenges and their tasks.
          </p>
        </div>
        <Link href="/challenges/new" className={cn(buttonVariants(), "gap-1.5")}>
          <Plus className="size-4" />
          New Challenge
        </Link>
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base font-semibold">All Challenges</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {challenges.map((challenge) => (
                <TableRow key={challenge.id}>
                  <TableCell className="font-medium">{challenge.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {challenge.tasks} tasks
                  </TableCell>
                  <TableCell className="text-muted-foreground">{challenge.startDate}</TableCell>
                  <TableCell className="text-muted-foreground">{challenge.endDate}</TableCell>
                  <TableCell>
                    {challenge.status === "active" ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/challenges/${challenge.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>View</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
