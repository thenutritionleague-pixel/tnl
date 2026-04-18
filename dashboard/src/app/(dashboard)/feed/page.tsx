import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

type FeedItemType = "task_approved" | "announcement" | "rank_change"
type FeedSource = "auto" | "admin"

type FeedItem = {
  id: string
  type: FeedItemType
  source: FeedSource
  timestamp: string
  content: string
  reactions: number
}

const feedItems: FeedItem[] = [
  {
    id: "f1",
    type: "announcement",
    source: "admin",
    timestamp: "Apr 7, 2026 · 9:00 AM",
    content:
      "Welcome to Week 2 of the The Nutrition League! This week's bonus challenge is out — complete the Healthy Cooking Workshop for extra 🥦 40 pts.",
    reactions: 14,
  },
  {
    id: "f2",
    type: "task_approved",
    source: "auto",
    timestamp: "Apr 6, 2026 · 9:14 AM",
    content:
      "Arjun Shah completed \"Walk 10,000 steps\" and earned 🥦 20 pts for Team Alpha!",
    reactions: 6,
  },
  {
    id: "f3",
    type: "rank_change",
    source: "auto",
    timestamp: "Apr 6, 2026 · 8:00 AM",
    content:
      "Leaderboard update: Team Alpha moves to #1 with 3,840 pts. Team Beta follows at #2 with 3,120 pts.",
    reactions: 22,
  },
  {
    id: "f4",
    type: "task_approved",
    source: "auto",
    timestamp: "Apr 5, 2026 · 7:30 PM",
    content:
      "Priya Mehta completed \"Drink 8 glasses of water\" and earned 🥦 15 pts for Team Beta!",
    reactions: 4,
  },
  {
    id: "f5",
    type: "announcement",
    source: "admin",
    timestamp: "Apr 5, 2026 · 10:00 AM",
    content:
      "Reminder: All Week 1 task submissions must be uploaded before midnight tonight. Late submissions will not be accepted.",
    reactions: 9,
  },
  {
    id: "f6",
    type: "task_approved",
    source: "auto",
    timestamp: "Apr 4, 2026 · 6:45 PM",
    content:
      "Vikram Rao completed \"Skip sugar for a day\" and earned 🥦 20 pts for Team Alpha. Great discipline!",
    reactions: 11,
  },
]

const icons: Record<FeedItemType, string> = {
  task_approved: "🥦",
  announcement: "📢",
  rank_change: "🏆",
}

function FeedItemCard({ item }: { item: FeedItem }) {
  return (
    <div className="flex gap-4">
      {/* Icon */}
      <div className="shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg">
        {icons[item.type]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs text-muted-foreground">{item.timestamp}</span>
          {item.source === "auto" ? (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              Auto
            </Badge>
          ) : (
            <Badge className="text-xs px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
              📢 Admin
            </Badge>
          )}
        </div>
        <p className="text-sm text-foreground leading-relaxed">{item.content}</p>
        <p className="text-xs text-muted-foreground mt-1.5">
          {item.reactions} reaction{item.reactions !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  )
}

export default function FeedPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-foreground">Feed</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            League activity, announcements, and updates.
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-white">
          New Post
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">
        {/* Feed list — 2/3 */}
        <div className="flex-[2] min-w-0 bg-card border border-border rounded-xl divide-y divide-border">
          {feedItems.map((item, idx) => (
            <div key={item.id} className={`p-4 ${idx === 0 ? "rounded-t-xl" : ""} ${idx === feedItems.length - 1 ? "rounded-b-xl" : ""}`}>
              <FeedItemCard item={item} />
            </div>
          ))}
        </div>

        {/* New Announcement card — 1/3 */}
        <div className="flex-1 min-w-0 sticky top-6">
          <Card className="bg-card border border-border rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">
                New Announcement
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 space-y-4">
              <Textarea
                placeholder="Write an announcement to post in the league feed…"
                className="min-h-[120px] resize-none"
              />
              <Button className="w-full bg-primary hover:bg-primary/90 text-white">
                Post to Feed
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
