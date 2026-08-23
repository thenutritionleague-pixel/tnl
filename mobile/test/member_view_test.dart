import 'package:flutter_test/flutter_test.dart';
import 'package:yi_nutrition_league/core/logic/member_view.dart';

/// Each case is a rule a reported bug broke, or a rule that would have caught
/// one had it existed.

void main() {
  group('denseRankFor', () {
    test('teams level on points share a place', () {
      const board = [2000, 2000, 2000, 1900, 1900, 1800];
      expect(denseRankFor(2000, board), 1);
      expect(denseRankFor(1900, board), 2);
      expect(denseRankFor(1800, board), 3);
    });

    test('counts DISTINCT higher scores, not teams ahead', () {
      // The bug: counting rows ahead made a team reading 5th on the Leaderboard
      // read 18th on Home. 104 of 116 teams disagreed, worst by 46 places.
      const board = [500, 500, 500, 500, 400];
      expect(denseRankFor(400, board), 2, reason: 'four rows ahead, one score');
    });

    test('leader is 1st even when alone', () {
      expect(denseRankFor(100, [100]), 1);
    });

    test('a score below everything takes the last place', () {
      expect(denseRankFor(0, [30, 20, 10]), 4);
    });

    test('matches the dashboard on the live tie shape', () {
      // 116 live teams on 23 Aug had ties at places 8, 14, 15, 101 and 111.
      const board = [30900, 29100, 29100, 28950];
      expect(denseRankFor(29100, board), 2);
      expect(denseRankFor(28950, board), 3, reason: 'tie consumes one place');
    });
  });

  group('donePct', () {
    test('all of today’s tasks done reads 100', () {
      expect(donePct(6, 6), 100);
    });

    test('denominator is today’s tasks, not the whole challenge', () {
      // Eight tasks exist; six run today. A member who did all six is at 100%,
      // not 75%.
      expect(donePct(6, 6), 100);
      expect(donePct(6, 8), 75);
    });

    test('no tasks today is 0, never a divide by zero', () {
      expect(donePct(0, 0), 0);
      expect(donePct(3, 0), 0);
    });

    test('rounds to the nearest whole percent', () {
      expect(donePct(1, 3), 33);
      expect(donePct(2, 3), 67);
    });

    test('never exceeds 100 even if done overshoots', () {
      expect(donePct(7, 6), 100);
    });
  });

  group('resubmitWindowOpen', () {
    final now = DateTime(2026, 8, 23, 14, 0);

    test('never reviewed stays open', () {
      expect(resubmitWindowOpen(null, now), isTrue);
    });

    test('rejected today is open', () {
      expect(resubmitWindowOpen(DateTime(2026, 8, 23, 1, 0), now), isTrue);
    });

    test('rejected yesterday is still open', () {
      expect(resubmitWindowOpen(DateTime(2026, 8, 22, 23, 0), now), isTrue);
    });

    test('rejected two days ago has closed', () {
      expect(resubmitWindowOpen(DateTime(2026, 8, 21, 23, 0), now), isFalse);
    });

    test('counted from the review, not the submission', () {
      // A review that ran 27 hours late must not eat the member's window.
      final reviewedLate = DateTime(2026, 8, 23, 9, 0);
      expect(resubmitWindowOpen(reviewedLate, now), isTrue);
    });
  });

  group('resolveSubmissionView', () {
    test('the snapshot wins, so editing a task cannot rewrite history', () {
      final view = resolveSubmissionView({
        'task_snapshot': {'title': 'Old Title', 'icon': '🥦', 'points': 200},
        'tasks': {'title': 'Renamed Today', 'icon': '🍽️', 'points': 100},
      });
      expect(view.title, 'Old Title');
      expect(view.icon, '🥦');
      expect(view.pointsLabel, '200');
    });

    test('falls back to the live task when there is no snapshot', () {
      final view = resolveSubmissionView({
        'tasks': {'title': 'Crunch Before Lunch', 'icon': '🥗', 'points': 100},
      });
      expect(view.title, 'Crunch Before Lunch');
      expect(view.pointsLabel, '100');
    });

    test('a claimed tier shows its own value, not the range', () {
      final view = resolveSubmissionView({
        'task_snapshot': {
          'title': 'Steps',
          'selected_tier': {'points': 200},
          'points_tiers': [
            {'points': 100},
            {'points': 200}
          ],
        },
      });
      expect(view.pointsLabel, '200');
    });

    test('an unclaimed tiered task shows the range', () {
      final view = resolveSubmissionView({
        'task_snapshot': {
          'title': 'Steps',
          'points_tiers': [
            {'points': 100},
            {'points': 200}
          ],
        },
      });
      expect(view.pointsLabel, '100–200');
    });

    test('a missing task degrades to placeholders, never a crash', () {
      final view = resolveSubmissionView({});
      expect(view.title, '—');
      expect(view.icon, '📋');
      expect(view.pointsLabel, '0');
      expect(view.description, '');
    });

    test('a snapshot missing a field falls through to the live task', () {
      final view = resolveSubmissionView({
        'task_snapshot': {'title': 'Snapshot Title'},
        'tasks': {'title': 'Live', 'icon': '🔥', 'description': 'live desc'},
      });
      expect(view.title, 'Snapshot Title');
      expect(view.icon, '🔥', reason: 'snapshot had no icon');
      expect(view.description, 'live desc');
    });
  });
}
