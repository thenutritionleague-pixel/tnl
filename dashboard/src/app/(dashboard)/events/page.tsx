import Link from "next/link"
import { Plus, Users, Calendar } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"

type EventType = "Quiz" | "Offline"
type EventStatus = "Active" | "Upcoming" | "Ended"

type LeagueEvent = {
  id: string
  type: EventType
  title: string
  description: string
  points: number
  dateTime: string
  participants: number
  status: EventStatus
}

const events: LeagueEvent[] = [
  {
    id: "e1",
    type: "Quiz",
    title: "Nutrition Quiz #1",
    description:
      "Test your knowledge on macronutrients, vitamins, and healthy eating habits. 10 questions, timed.",
    points: 50,
    dateTime: "Apr 3, 2026 · 7:00 PM",
    participants: 24,
    status: "Active",
  },
  {
    id: "e2",
    type: "Offline",
    title: "Weekend Walk Challenge",
    description:
      "Walk 10,000 steps on Saturday and Sunday. Submit your step count screenshot for verification.",
    points: 30,
    dateTime: "Mar 29–30, 2026",
    participants: 18,
    status: "Ended",
  },
  {
    id: "e3",
    type: "Offline",
    title: "Healthy Cooking Workshop",
    description:
      "Join us for a hands-on cooking session focused on low-oil, high-protein Indian recipes.",
    points: 40,
    dateTime: "Apr 12, 2026 · 11:00 AM",
    participants: 0,
    status: "Upcoming",
  },
  {
    id: "e4",
    type: "Quiz",
    title: "Hydration Quiz",
    description:
      "How well do you understand the importance of hydration? A quick 5-question quiz to find out.",
    points: 25,
    dateTime: "Mar 20, 2026 · 6:30 PM",
    participants: 32,
    status: "Ended",
  },
]

function eventTypeBadge(type: EventType) {
  if (type === "Quiz") {
    return (
      <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100">
        Quiz
      </Badge>
    )
  }
  return (
    <Badge className="bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-100">
      Offline
    </Badge>
  )
}

function statusBadge(status: EventStatus) {
  if (status === "Active") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
        Active
      </Badge>
    )
  }
  if (status === "Upcoming") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
        Upcoming
      </Badge>
    )
  }
  return <Badge variant="secondary">Ended</Badge>
}

export default function EventsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground">Events</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage quizzes, challenges, and offline activities.
          </p>
        </div>
        <Link href="/events/new" className={cn(buttonVariants(), "gap-1.5 bg-primary hover:bg-primary/90 text-white")}>
          <Plus className="size-4" />
          New Event
        </Link>
      </div>

      {/* Events Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {events.map((event) => (
          <Card
            key={event.id}
            className="bg-card border border-border rounded-xl flex flex-col"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                {eventTypeBadge(event.type)}
                {statusBadge(event.status)}
              </div>
              <h2 className="text-base font-semibold text-foreground mt-2">
                {event.title}
              </h2>
            </CardHeader>

            <CardContent className="flex-1 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {event.description}
              </p>

              <div className="space-y-2">
                {/* Points reward */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Reward:</span>
                  <span className="font-semibold text-emerald-600">
                    🥦 {event.points} pts
                  </span>
                </div>

                {/* Date/time */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="size-3.5 shrink-0" />
                  <span>{event.dateTime}</span>
                </div>

                {/* Participants */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="size-3.5 shrink-0" />
                  <span>
                    {event.participants === 0
                      ? "No participants yet"
                      : `${event.participants} participants`}
                  </span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-0">
              <Button variant="outline" size="sm" className="w-full">
                Manage
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
