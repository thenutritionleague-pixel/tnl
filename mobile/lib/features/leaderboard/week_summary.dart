/// Pure aggregation for a member's weekly breakdown.
///
/// This lives outside the widget on purpose. Every display bug reported during
/// the National event was arithmetic of exactly this kind — "+-200" on a
/// revoked award, one task rendered three times, 83% on a finished day, and a
/// "missed" invented for every day a task never ran. All of it sat inside
/// build methods, where nothing could reach it, so the only way to find a
/// mistake was for a member to see it first.
///
/// Anything here is a plain function over plain data and is covered by
/// test/week_summary_test.dart. If a rule about days, misses or totals is
/// worth having, it belongs in this file with a test beside it.
library;

/// One task's outcome for one week, ready to render.
class TaskWeekSummary {
  const TaskWeekSummary({
    required this.title,
    required this.icon,
    required this.approvedDays,
    required this.missed,
    required this.rejected,
    required this.totalDays,
    required this.earned,
    required this.daysLabel,
    required this.indicators,
  });

  final String title;
  final String icon;

  /// Days in this week the member was approved for this task.
  final int approvedDays;

  /// Days the LEDGER recorded as missed. Never derived from the calendar.
  final int missed;
  final int rejected;

  /// Days this task actually ran for this member — approved + missed +
  /// rejected. NOT the length of the week: no task ran all seven days.
  final int totalDays;

  final int earned;

  /// e.g. "5 days × 🥦 100", "3/4 days", "1 day"
  final String daysLabel;

  /// e.g. "1 rejected · 2 missed", empty when the week was clean.
  final String indicators;

  bool get hasIssues => missed > 0 || rejected > 0;
}

/// Collapse a week's ledger entries into one row per task.
///
/// [entries] are the maps produced by LeaderboardService.getMemberWeeklyBreakdown:
/// `{title, icon, status: approved|missed|rejected, points}`.
List<TaskWeekSummary> summariseWeek(List<Map<String, dynamic>> entries) {
  final order = <String>[];
  final approvedByTask = <String, List<int>>{};
  final missedByTask = <String, int>{};
  final rejectedByTask = <String, int>{};
  final iconByTask = <String, String>{};

  for (final e in entries) {
    final title = e['title'] as String? ?? '';
    final status = e['status'] as String? ?? 'approved';
    if (!approvedByTask.containsKey(title)) {
      order.add(title);
      approvedByTask[title] = <int>[];
      missedByTask[title] = 0;
      rejectedByTask[title] = 0;
      iconByTask[title] = e['icon'] as String? ?? '📋';
    }
    switch (status) {
      case 'approved':
        approvedByTask[title]!.add(e['points'] as int? ?? 0);
      case 'missed':
        missedByTask[title] = missedByTask[title]! + 1;
      case 'rejected':
        rejectedByTask[title] = rejectedByTask[title]! + 1;
    }
  }

  return order.map((title) {
    final approved = approvedByTask[title]!;
    final missed = missedByTask[title]!;
    final rejected = rejectedByTask[title]!;
    final earned = approved.fold<int>(0, (s, p) => s + p);
    final totalDays = approved.length + missed + rejected;
    final hasIssues = missed > 0 || rejected > 0;

    // "5 days × 🥦 100" only holds when every approved day paid the same. A
    // tiered task can pay 100 one day and 200 the next, which is how
    // "5/7 days × 🥦 100" came to sit beside a total of 700.
    final distinctAmounts = approved.toSet();
    final sameEveryDay = distinctAmounts.length == 1;
    final dayWord = totalDays == 1 ? 'day' : 'days';

    final String daysLabel;
    if (totalDays == 0) {
      daysLabel = '';
    } else if (sameEveryDay) {
      daysLabel = hasIssues
          ? '${approved.length}/$totalDays $dayWord × 🥦 ${distinctAmounts.first}'
          : '$totalDays $dayWord × 🥦 ${distinctAmounts.first}';
    } else {
      daysLabel = hasIssues
          ? '${approved.length}/$totalDays $dayWord'
          : '$totalDays $dayWord';
    }

    return TaskWeekSummary(
      title: title,
      icon: iconByTask[title]!,
      approvedDays: approved.length,
      missed: missed,
      rejected: rejected,
      totalDays: totalDays,
      earned: earned,
      daysLabel: daysLabel,
      indicators: [
        if (rejected > 0) '$rejected rejected',
        if (missed > 0) '$missed missed',
      ].join(' · '),
    );
  }).toList();
}
