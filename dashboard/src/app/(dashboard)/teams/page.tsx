import Link from "next/link"
import { Plus, Users } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type Team = {
  id: string
  name: string
  captain: string
  members: number
  points: number
  color: string
  borderColor: string
  labelColor: string
}

const teams: Team[] = [
  {
    id: "alpha",
    name: "Team Alpha",
    captain: "Arjun Shah",
    members: 12,
    points: 3840,
    color: "bg-violet-500",
    borderColor: "border-l-violet-500",
    labelColor: "text-violet-600",
  },
  {
    id: "beta",
    name: "Team Beta",
    captain: "Priya Mehta",
    members: 11,
    points: 3120,
    color: "bg-sky-500",
    borderColor: "border-l-sky-500",
    labelColor: "text-sky-600",
  },
  {
    id: "gamma",
    name: "Team Gamma",
    captain: "Rahul Nair",
    members: 10,
    points: 2890,
    color: "bg-amber-500",
    borderColor: "border-l-amber-500",
    labelColor: "text-amber-600",
  },
  {
    id: "delta",
    name: "Team Delta",
    captain: "Sneha Patel",
    members: 9,
    points: 2640,
    color: "bg-rose-500",
    borderColor: "border-l-rose-500",
    labelColor: "text-rose-600",
  },
]

export default function TeamsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground">Teams</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage teams, captains, and member assignments.
          </p>
        </div>
        <Link href="/teams/new" className={cn(buttonVariants(), "gap-1.5")}>
          <Plus className="size-4" />
          New Team
        </Link>
      </div>

      {/* Teams Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team) => (
          <Card
            key={team.id}
            className={`border-l-4 ${team.borderColor}`}
          >
            <CardHeader>
              <CardTitle className={`text-lg font-semibold ${team.labelColor}`}>
                {team.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Members</p>
                  <div className="flex items-center gap-1.5">
                    <Users className="size-3.5 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      {team.members}
                    </span>
                  </div>
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Points</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    🥦 {team.points.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Captain */}
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${team.color}`}>
                  {team.captain
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground leading-none">Captain</p>
                  <p className="text-sm font-medium text-foreground">{team.captain}</p>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Link href={`/teams/${team.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}>View Team</Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
