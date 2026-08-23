import 'package:flutter_test/flutter_test.dart';
import 'package:yi_nutrition_league/features/leaderboard/week_summary.dart';

/// Regression tests for the weekly breakdown.
///
/// Each case here is a bug a member actually reported, written as the rule it
/// broke. The app had 45 Dart files and one test that checked it did not crash
/// on startup, so every one of these reached a member before anyone saw it.

Map<String, dynamic> approved(String title, int points) =>
    {'title': title, 'icon': '🥦', 'status': 'approved', 'points': points};
Map<String, dynamic> missed(String title) =>
    {'title': title, 'icon': '🥦', 'status': 'missed', 'points': 0};
Map<String, dynamic> rejected(String title) =>
    {'title': title, 'icon': '🥦', 'status': 'rejected', 'points': 0};

void main() {
  group('a miss is only ever what the ledger says', () {
    test('a task that ran one day and was done shows NO missed', () {
      // 23 Aug 2026: captains reported "6 missed" against Task 0, which ran on
      // 16 Aug alone. Surabhi Shah and Ayussh Rathhi had ZERO missed rows in
      // the ledger and were each shown 21 misses across the week.
      final rows = summariseWeek([approved('Jump In Before We Jump In', 10)]);
      expect(rows.single.missed, 0);
      expect(rows.single.totalDays, 1);
      expect(rows.single.indicators, '');
      expect(rows.single.hasIssues, isFalse);
    });

    test('days never come from the length of the week', () {
      // The old code did `7 - approved - rejected - missed`, so a task that ran
      // three days looked like four misses.
      final rows = summariseWeek([
        approved('Broccoli Burpee Bash', 200),
        approved('Broccoli Burpee Bash', 200),
        approved('Broccoli Burpee Bash', 200),
      ]);
      expect(rows.single.totalDays, 3, reason: 'days the task ran, not 7');
      expect(rows.single.missed, 0);
      expect(rows.single.earned, 600);
    });

    test('a genuine miss from the ledger still shows', () {
      final rows = summariseWeek([missed('Jump In Before We Jump In')]);
      expect(rows.single.missed, 1);
      expect(rows.single.approvedDays, 0);
      expect(rows.single.totalDays, 1);
      expect(rows.single.indicators, '1 missed');
      expect(rows.single.daysLabel, '0/1 day');
    });

    test('approved and missed days combine into the days the task ran', () {
      final rows = summariseWeek([
        approved('Crunch Before Lunch', 100),
        approved('Crunch Before Lunch', 100),
        missed('Crunch Before Lunch'),
      ]);
      expect(rows.single.totalDays, 3);
      expect(rows.single.approvedDays, 2);
      expect(rows.single.daysLabel, '2/3 days × 🥦 100');
      expect(rows.single.earned, 200);
    });
  });

  group('the × label only claims what is true', () {
    test('a tiered task paying different amounts does not multiply', () {
      // Surabhi Shah's Steps read "5/7 days × 🥦 100" beside a total of 700.
      final rows = summariseWeek([
        approved('Steps', 100),
        approved('Steps', 100),
        approved('Steps', 100),
        approved('Steps', 200),
        approved('Steps', 200),
      ]);
      expect(rows.single.earned, 700);
      expect(rows.single.daysLabel, '5 days',
          reason: 'no × when the daily amount varies');
      expect(rows.single.daysLabel, isNot(contains('×')));
    });

    test('a flat task keeps the multiplication', () {
      final rows = summariseWeek([
        approved('Plant Power', 100),
        approved('Plant Power', 100),
      ]);
      expect(rows.single.daysLabel, '2 days × 🥦 100');
      expect(rows.single.earned, 200);
    });
  });

  group('grammar', () {
    test('one day is a day, not "1 days"', () {
      final rows = summariseWeek([approved('Plank Stand', 150)]);
      expect(rows.single.daysLabel, '1 day × 🥦 150');
    });
  });

  group('rejections', () {
    test('a rejected day counts as a day the task ran, and earns nothing', () {
      final rows = summariseWeek([
        approved('Burpee', 200),
        rejected('Burpee'),
      ]);
      expect(rows.single.rejected, 1);
      expect(rows.single.totalDays, 2);
      expect(rows.single.earned, 200);
      expect(rows.single.indicators, '1 rejected');
    });

    test('rejected and missed are reported separately', () {
      final rows = summariseWeek([
        approved('Burpee', 200),
        rejected('Burpee'),
        missed('Burpee'),
      ]);
      expect(rows.single.indicators, '1 rejected · 1 missed');
      expect(rows.single.totalDays, 3);
    });
  });

  group('shape', () {
    test('several tasks stay separate and keep ledger order', () {
      final rows = summariseWeek([
        approved('Steps', 100),
        approved('Crunch', 100),
        approved('Steps', 100),
      ]);
      expect(rows.map((r) => r.title), ['Steps', 'Crunch']);
      expect(rows.first.totalDays, 2);
      expect(rows.last.totalDays, 1);
    });

    test('an empty week produces no rows', () {
      expect(summariseWeek([]), isEmpty);
    });

    test('earned never counts a missed or rejected day', () {
      final rows = summariseWeek([
        missed('Plant Power'),
        rejected('Plant Power'),
      ]);
      expect(rows.single.earned, 0);
      expect(rows.single.approvedDays, 0);
    });
  });
}
