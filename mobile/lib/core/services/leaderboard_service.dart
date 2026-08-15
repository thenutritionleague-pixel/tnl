import 'dart:math';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../utils/fetch_all_rows.dart';

class LeaderboardService {
  static final _client = Supabase.instance.client;

  /// Get team leaderboard — all teams sorted by points descending.
  /// When [challengeIds] contains multiple IDs the points are SUMMED across
  /// all of them (multi-challenge view). Pass a single-element list for the
  /// legacy single-challenge behavior. Empty list → all zeros.
  static Future<List<Map<String, dynamic>>> getTeamLeaderboard(
    String orgId,
    List<String> challengeIds,
  ) async {
    final teams = await _client
        .from('teams')
        .select('id, name, emoji, color')
        .eq('org_id', orgId)
        .order('name');

    if ((teams as List).isEmpty) return [];

    final Map<String, int> pointsMap = {};
    if (challengeIds.isNotEmpty) {
      // Reads the precomputed materialized view (team_points_mv) via a
      // SECURITY DEFINER RPC that enforces org isolation. This is a tiny
      // indexed lookup that cannot time out under load — unlike the live
      // 5-table JOIN (team_points_view) that previously broke the leaderboard
      // as data volume grew. The MV is refreshed every 45s; a member's own
      // approval + points still update instantly (those don't use the MV).
      // The RPC already SUMs across the passed challenge_ids -> one row/team.
      final points = await _client.rpc(
        'get_team_leaderboard_points',
        params: {'p_challenge_ids': challengeIds},
      );
      for (final row in points as List) {
        final tid = row['team_id'] as String;
        pointsMap[tid] = (row['total_points'] as int?) ?? 0;
      }
    }

    final result = teams.map<Map<String, dynamic>>((team) => {
      'team_id': team['id'],
      'total_points': pointsMap[team['id']] ?? 0,
      'name': team['name'] ?? '',
      'emoji': team['emoji'] ?? '🏃',
      'color': team['color'] ?? '#059669',
    }).toList();

    result.sort((a, b) => (b['total_points'] as int).compareTo(a['total_points'] as int));
    return result;
  }

  /// Get individual member leaderboard — sorted by total_points descending.
  static Future<List<Map<String, dynamic>>> getMemberLeaderboard(
    String orgId,
  ) async {
    // Paginated: National has 1100+ members, so an unbounded select returned
    // only the first 1000 rows. Ordered by points descending, that silently cut
    // the lowest-scoring members off the end — they could never find themselves
    // on the leaderboard. Secondary sort on id keeps page boundaries stable
    // when several members are tied on points.
    final data = await fetchAllRows(
      (from, to) => _client
          .from('profiles')
          .select('id, name, avatar_color, avatar_url, total_points, team_members(teams(name, emoji))')
          .eq('org_id', orgId)
          .order('total_points', ascending: false)
          .order('id', ascending: true)
          .range(from, to),
    );

    return data.map<Map<String, dynamic>>((member) {
      final teamMembers = member['team_members'] as List?;
      final team = (teamMembers != null && teamMembers.isNotEmpty)
          ? (teamMembers.first['teams'] as Map?)
          : null;
      return {
        'id': member['id'],
        'name': member['name'],
        'avatar_color': member['avatar_color'],
        'avatar_url': member['avatar_url'],
        'total_points': member['total_points'],
        'team_name': team?['name'] ?? 'No Team',
        'team_emoji': team?['emoji'] ?? '🏃',
      };
    }).toList();
  }

  /// Batch-fetch member previews (name + avatar_color) for ALL teams in org.
  /// Returns a map of team_id → ordered list of member previews.
  static Future<Map<String, List<Map<String, dynamic>>>> getTeamMemberPreviews(
    String orgId,
  ) async {
    // Paginated + explicitly ordered: this covers every team in the org, so at
    // 1100+ members it crossed the 1000-row cap and some teams rendered with
    // missing member avatars. The order is required for .range() to page
    // deterministically.
    final data = await fetchAllRows(
      (from, to) => _client
          .from('team_members')
          .select('team_id, profiles!inner(name, avatar_color, avatar_url)')
          .eq('org_id', orgId)
          .order('team_id', ascending: true)
          .order('user_id', ascending: true)
          .range(from, to),
    );

    final Map<String, List<Map<String, dynamic>>> result = {};
    for (final m in data) {
      final teamId = m['team_id'] as String;
      final profile = m['profiles'] as Map;
      result.putIfAbsent(teamId, () => []).add({
        'name': profile['name'] ?? '',
        'avatar_color': profile['avatar_color'],
        'avatar_url': profile['avatar_url'],
      });
    }
    return result;
  }

  /// Get members of a team with their points earned in the given challenge.
  static Future<List<Map<String, dynamic>>> getTeamMembersWithPoints(
    String teamId,
    String orgId,
    String challengeId,
  ) async {
    final members = await _client
        .from('team_members')
        .select('user_id, role, profiles!inner(id, name, avatar_color, avatar_url, total_points)')
        .eq('team_id', teamId)
        .eq('org_id', orgId);

    final userIds = (members as List)
        .map((m) => m['user_id'] as String)
        .toList();

    final result = members.map<Map<String, dynamic>>((m) {
      final profile = m['profiles'] as Map;
      final pts = (profile['total_points'] as int?) ?? 0;
      return {
        'id': profile['id'],
        'name': profile['name'] ?? '',
        'avatar_color': profile['avatar_color'],
        'avatar_url': profile['avatar_url'],
        'total_points': pts,
        'challenge_points': pts,
        'role': m['role'] ?? 'member',
      };
    }).toList();

    result.sort((a, b) =>
        (b['challenge_points'] as int).compareTo(a['challenge_points'] as int));
    return result;
  }

  /// Get a member's full point history grouped by week.
  /// Single source of truth: points_transactions has every event —
  /// task approvals (is_manual=false, amount>0), missed (amount=0),
  /// and manual adjustments (is_manual=true).
  static Future<(Map<int, List<Map<String, dynamic>>>, DateTime?)> getMemberWeeklyBreakdown(
    String userId,
    String challengeId,
  ) async {
    if (challengeId.isEmpty) return (<int, List<Map<String, dynamic>>>{}, null);

    final results = await Future.wait<dynamic>([
      _client.from('challenges').select('start_date').eq('id', challengeId).single(),
      _client
          .from('points_transactions')
          .select('amount, reason, is_manual, created_at, transaction_date, task_submissions(submitted_date, tasks(title, icon, points))')
          .eq('user_id', userId)
          .order('created_at', ascending: true),
    ]);

    final challengeData = results[0] as Map<String, dynamic>;
    final txns = results[1] as List;

    final DateTime? startDate =
        DateTime.tryParse(challengeData['start_date'] as String? ?? '');

    int weekFor(String dateStr) {
      if (startDate == null || dateStr.isEmpty) return 1;
      final d = DateTime.tryParse(dateStr);
      if (d == null) return 1;
      final diff = d.difference(DateTime(startDate.year, startDate.month, startDate.day)).inDays;
      return max(1, (diff / 7).floor() + 1);
    }

    String fmtDate(String dateStr) {
      try {
        final d = DateTime.parse(dateStr);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return '${months[d.month - 1]} ${d.day}';
      } catch (_) {
        return dateStr;
      }
    }

    final Map<int, List<Map<String, dynamic>>> grouped = {};

    for (final t in txns) {
      final amount = (t['amount'] as int?) ?? 0;
      final isManual = (t['is_manual'] as bool?) ?? false;
      final createdAt = t['created_at'] as String? ?? '';
      final rawReason = t['reason'] as String? ?? '';
      final sub = t['task_submissions'] as Map?;
      final task = sub?['tasks'] as Map?;

      // Skip entries that predate this challenge
      if (startDate != null && createdAt.isNotEmpty) {
        final d = DateTime.tryParse(createdAt);
        if (d != null && d.isBefore(DateTime(startDate.year, startDate.month, startDate.day))) {
          continue;
        }
      }

      if (isManual) {
        // Admin manual adjustment (+ or -)
        final byMatch = RegExp(r'\[by ([^\]]+)\]$').firstMatch(rawReason);
        final adminName = byMatch?.group(1) ?? '';
        final title = rawReason.replaceAll(RegExp(r'\s*\[by [^\]]+\]$'), '').trim();
        // Use explicit event date if set; fall back to created_at date
        final txDate = t['transaction_date'] as String? ?? '';
        final week = weekFor(txDate.isNotEmpty ? txDate : createdAt);
        grouped.putIfAbsent(week, () => []).add({
          'title': title.isNotEmpty ? title : (amount >= 0 ? 'Bonus Points' : 'Point Deduction'),
          'icon': '✏️',
          'date': fmtDate(createdAt),
          'status': 'approved',
          'points': amount,
          'admin_hint': adminName.isNotEmpty ? 'Added by $adminName' : 'Added by admin',
        });
      } else if (amount == 0) {
        // Missed task — use date from reason string, NOT created_at (cron runs next day)
        final dateMatch = RegExp(r'\((\d{4}-\d{2}-\d{2})\)\s*$').firstMatch(rawReason);
        final missedDate = dateMatch?.group(1) ?? '';
        final subDate = sub?['submitted_date'] as String? ?? '';
        final displayDate = subDate.isNotEmpty ? subDate : (missedDate.isNotEmpty ? missedDate : createdAt);
        final title = task?['title'] as String? ??
            rawReason
                .replaceFirst(RegExp(r'^Task missed:\s*', caseSensitive: false), '')
                .replaceAll(RegExp(r'\s*\(\d{4}-\d{2}-\d{2}\)\s*$'), '')
                .trim();
        final week = weekFor(missedDate.isNotEmpty ? missedDate : (subDate.isNotEmpty ? subDate : createdAt));
        grouped.putIfAbsent(week, () => []).add({
          'title': title,
          'icon': task?['icon'] as String? ?? '📋',
          'date': fmtDate(displayDate),
          'status': 'missed',
          'points': task?['points'] as int? ?? 0,
        });
      } else {
        // Task approved — use submitted_date for week assignment
        final subDate = sub?['submitted_date'] as String? ?? '';
        final week = weekFor(subDate.isNotEmpty ? subDate : createdAt);
        grouped.putIfAbsent(week, () => []).add({
          'title': task?['title'] as String? ?? rawReason,
          'icon': task?['icon'] as String? ?? '📋',
          'date': fmtDate(subDate.isNotEmpty ? subDate : createdAt),
          'status': 'approved',
          'points': amount,
        });
      }
    }

    return (grouped, startDate);
  }

  /// Get a team's total points grouped by week number.
  /// Returns {week_number: total_points} for all weeks that have started,
  /// including weeks with 0 points (week started but no activity yet).
  /// Uses a SECURITY DEFINER RPC to bypass RLS.
  static Future<Map<int, int>> getTeamWeeklyPoints(
    String teamId,
    String orgId,
    String challengeId,
  ) async {
    if (challengeId.isEmpty) return {};

    final results = await Future.wait<dynamic>([
      _client.rpc('get_team_weekly_pts', params: {
        'p_team_id':      teamId,
        'p_org_id':       orgId,
        'p_challenge_id': challengeId,
      }),
      _client.from('challenges').select('start_date').eq('id', challengeId).single(),
    ]);

    final rows = results[0] as List;
    final startDateStr = (results[1] as Map<String, dynamic>)['start_date'] as String? ?? '';
    final startDate = DateTime.tryParse(startDateStr);

    final Map<int, int> result = {};

    // Fill all weeks that have started with 0 as default
    if (startDate != null) {
      final today = DateTime.now();
      final daysDiff = today
          .difference(DateTime(startDate.year, startDate.month, startDate.day))
          .inDays;
      final currentWeek = max(1, (daysDiff / 7).floor() + 1);
      for (int w = 1; w <= currentWeek; w++) {
        result[w] = 0;
      }
    }

    // Overwrite with actual points from RPC
    for (final row in rows) {
      final week = (row['week_number'] as num?)?.toInt() ?? 1;
      final pts  = (row['total_points'] as num?)?.toInt() ?? 0;
      result[week] = pts;
    }

    return result;
  }
}
