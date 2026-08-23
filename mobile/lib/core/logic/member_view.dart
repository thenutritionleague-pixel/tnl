/// Pure logic behind what a member is shown.
///
/// Everything here used to live inside build methods on Home, Tasks and
/// History, where no test could reach it. Every display bug reported during the
/// National event was arithmetic of exactly that kind, and a member always
/// found it before we did.
///
/// Rules that decide a number, a place or a deadline belong in this file, with
/// a test beside them in test/member_view_test.dart.
library;

// ── Ranking ─────────────────────────────────────────────────────────────────

/// Dense rank: 1 + however many DISTINCT higher scores exist.
///
/// Teams level on points share a place and the next different score takes the
/// next number — 2000/2000/2000 are all 1st, 1900/1900 are 2nd, 1800 is 3rd.
///
/// Home and the Leaderboard both used to compute this inline. When one counted
/// teams ahead rather than distinct scores, a team reading "5th" on one screen
/// read "18th" on the other; 104 of 116 teams disagreed, the worst by 46
/// places. The dashboard report has the matching TypeScript in denseRanks().
///
/// [allPoints] must be the FULL board, never a top-5 preview slice.
int denseRankFor(int points, Iterable<int> allPoints) {
  final higher = <int>{};
  for (final p in allPoints) {
    if (p > points) higher.add(p);
  }
  return higher.length + 1;
}

// ── Daily progress ──────────────────────────────────────────────────────────

/// Percentage of today's tasks a member has completed.
///
/// [total] must be the tasks actually available to this member today — the
/// count get_mobile_tasks returns — not every task in the challenge. Eight
/// tasks exist but only six run on any given day, and dividing by eight would
/// cap a member who finished everything at 75%.
int donePct(int done, int total) {
  if (total <= 0) return 0;
  if (done >= total) return 100;
  return ((done / total) * 100).round();
}

// ── Resubmitting a rejected day ─────────────────────────────────────────────

/// Whether a member may still replace a rejected submission.
///
/// Counted from when they were TOLD, not when they submitted. Reviews can run
/// hours or days behind — one took 27 hours during the 20 Aug backlog — and a
/// member should never lose their chance because the queue was slow. They get
/// the rest of the day they were rejected, plus all of the next one.
///
/// Without a limit a member could sit on four rejected days and fill them all
/// from fresh photos on the final evening, which is a different problem.
bool resubmitWindowOpen(DateTime? reviewedAt, DateTime now) {
  if (reviewedAt == null) return true; // never reviewed: nothing to lose
  final reviewedDay = DateTime(reviewedAt.year, reviewedAt.month, reviewedAt.day);
  final today = DateTime(now.year, now.month, now.day);
  return today.difference(reviewedDay).inDays <= 1;
}

// ── What a past submission shows ────────────────────────────────────────────

/// The task details rendered against one past submission.
class SubmissionView {
  const SubmissionView({
    required this.title,
    required this.description,
    required this.icon,
    required this.pointsLabel,
  });

  final String title;
  final String description;
  final String icon;

  /// "200" for a claimed tier, "100–200" for an unclaimed tiered task,
  /// "100" for a flat one.
  final String pointsLabel;
}

/// Resolve what to show for a past submission.
///
/// The snapshot frozen at submission time wins, because a task edited later
/// must not rewrite history — a member who earned 200 under the old wording
/// should still see the task they actually did. The live task join is only a
/// fallback for rows submitted before snapshots existed.
SubmissionView resolveSubmissionView(Map<String, dynamic> submission) {
  final liveTask = submission['tasks'] as Map<String, dynamic>? ?? const {};
  final snap = submission['task_snapshot'] as Map<String, dynamic>?;
  final task = snap ?? liveTask;

  String pick(String key, String fallback) =>
      (task[key] as String?) ?? (liveTask[key] as String?) ?? fallback;

  final selectedTier = task['selected_tier'] as Map<String, dynamic>?;
  final tiersRaw = task['points_tiers'] ?? liveTask['points_tiers'];
  final tiers = (tiersRaw is List && tiersRaw.isNotEmpty)
      ? List<Map<String, dynamic>>.from(
          tiersRaw.whereType<Map>().map((m) => Map<String, dynamic>.from(m)))
      : null;

  final String pointsLabel;
  if (selectedTier != null) {
    pointsLabel = '${selectedTier['points']}';
  } else if (tiers != null && tiers.isNotEmpty) {
    pointsLabel = '${tiers.first['points']}–${tiers.last['points']}';
  } else {
    pointsLabel =
        '${(task['points'] as int?) ?? (liveTask['points'] as int?) ?? 0}';
  }

  return SubmissionView(
    title: pick('title', '—'),
    description: pick('description', ''),
    icon: pick('icon', '📋'),
    pointsLabel: pointsLabel,
  );
}

// ── Period wording ──────────────────────────────────────────────────────────

/// The word a member sees in front of a task's `week_number`.
///
/// `week_number` is a task SEQUENCE number, not a calendar week: the National
/// challenge releases one task per day and numbers them 1–6 over nine calendar
/// days. Which word it takes is the org's choice, held in
/// `challenges.period_label` — 'day' for National, 'week' for the city events.
///
/// The Tasks screen has always honoured that label; Home hardcoded "week"
/// against the same field, so the Balance Build task read "Day 6" on one screen
/// and "Since week 6" on the other. Same number, same source, two words.
///
/// [periodLabel] anything other than 'day' means 'week', so a missing or
/// unexpected value can only ever fall back to the city wording, never crash.
String taskPeriodLabel(String? periodLabel, Object? weekNumber) {
  final word = periodLabel == 'day' ? 'day' : 'week';
  final n = weekNumber is int
      ? weekNumber
      : int.tryParse('${weekNumber ?? ''}') ?? 1;
  return 'Since $word $n';
}
