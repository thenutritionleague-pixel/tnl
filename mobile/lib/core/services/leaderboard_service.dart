import 'dart:math';
import 'package:supabase_flutter/supabase_flutter.dart';

class LeaderboardService {
  static final _client = Supabase.instance.client;

  /// Get team leaderboard — all teams sorted by points descending.
  static Future<List<Map<String, dynamic>>> getTeamLeaderboard(
    String orgId,
    String challengeId,
  ) async {
    final teams = await _client
        .from('teams')
        .select('id, name, emoji, color')
        .eq('org_id', orgId)
        .order('name');

    if ((teams as List).isEmpty) return [];

    final Map<String, int> pointsMap = {};
    if (challengeId.isNotEmpty) {
      final points = await _client
          .from('team_points_view')
          .select('team_id, total_points')
          .eq('challenge_id', challengeId);
      for (final row in points as List) {
        pointsMap[row['team_id'] as String] = (row['total_points'] as int?) ?? 0;
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
    final data = await _client
        .from('profiles')
        .select('id, name, avatar_color, total_points, team_members(teams(name, emoji))')
        .eq('org_id', orgId)
        .order('total_points', ascending: false);

    return (data as List).map<Map<String, dynamic>>((member) {
      final teamMembers = member['team_members'] as List?;
      final team = (teamMembers != null && teamMembers.isNotEmpty)
          ? (teamMembers.first['teams'] as Map?)
          : null;
      return {
        'id': member['id'],
        'name': member['name'],
        'avatar_color': member['avatar_color'],
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
    final data = await _client
        .from('team_members')
        .select('team_id, profiles!inner(name, avatar_color)')
        .eq('org_id', orgId);

    final Map<String, List<Map<String, dynamic>>> result = {};
    for (final m in data as List) {
      final teamId = m['team_id'] as String;
      final profile = m['profiles'] as Map;
      result.putIfAbsent(teamId, () => []).add({
        'name': profile['name'] ?? '',
        'avatar_color': profile['avatar_color'],
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
        .select('user_id, role, profiles!inner(id, name, avatar_color, total_points)')
        .eq('team_id', teamId)
        .eq('org_id', orgId);

    final userIds = (members as List)
        .map((m) => m['user_id'] as String)
        .toList();

    final Map<String, int> challengePoints = {};
    if (userIds.isNotEmpty && challengeId.isNotEmpty) {
      final subs = await _client
          .from('task_submissions')
          .select('user_id, points_awarded')
          .eq('challenge_id', challengeId)
          .eq('status', 'approved')
          .inFilter('user_id', userIds);
      for (final s in subs as List) {
        final uid = s['user_id'] as String;
        challengePoints[uid] =
            (challengePoints[uid] ?? 0) + ((s['points_awarded'] as int?) ?? 0);
      }
    }

    final result = members.map<Map<String, dynamic>>((m) {
      final profile = m['profiles'] as Map;
      final uid = m['user_id'] as String;
      return {
        'id': profile['id'],
        'name': profile['name'] ?? '',
        'avatar_color': profile['avatar_color'],
        'total_points': profile['total_points'] ?? 0,
        'challenge_points': challengePoints[uid] ?? 0,
        'role': m['role'] ?? 'member',
      };
    }).toList();

    result.sort((a, b) =>
        (b['challenge_points'] as int).compareTo(a['challenge_points'] as int));
    return result;
  }

  /// Get a member's full submission history grouped by week.
  /// Returns approved, rejected, pending, and missed entries — each with date and status.
  /// Also returns the challenge start date so the caller can compute the current week.
  static Future<(Map<int, List<Map<String, dynamic>>>, DateTime?)> getMemberWeeklyBreakdown(
    String userId,
    String challengeId,
  ) async {
    if (challengeId.isEmpty) return (<int, List<Map<String, dynamic>>>{}, null);

    final challengeFuture = _client
        .from('challenges')
        .select('start_date')
        .eq('id', challengeId)
        .single();

    // All statuses — approved, rejected, pending
    final subsFuture = _client
        .from('task_submissions')
        .select('status, points_awarded, submitted_date, tasks!inner(title, icon, week_number, points)')
        .eq('user_id', userId)
        .eq('challenge_id', challengeId)
        .order('submitted_date', ascending: true);

    // Missed-day penalty entries from points_transactions (amount=0)
    final missedFuture = _client
        .from('points_transactions')
        .select('reason, created_at, task_submissions(submitted_date, tasks(title, icon, points))')
        .eq('user_id', userId)
        .eq('amount', 0)
        .ilike('reason', 'Task missed:%')
        .order('created_at', ascending: true);

    final results = await Future.wait<dynamic>([challengeFuture, subsFuture, missedFuture]);

    final challengeData = results[0] as Map<String, dynamic>;
    final subs = results[1] as List;
    final missedTxns = results[2] as List;

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

    for (final s in subs) {
      final task = s['tasks'] as Map;
      final status = s['status'] as String? ?? 'pending';
      final dateStr = s['submitted_date'] as String? ?? '';
      final week = dateStr.isNotEmpty ? weekFor(dateStr) : ((task['week_number'] as int?) ?? 1);

      grouped.putIfAbsent(week, () => []).add({
        'title': task['title'] ?? '',
        'icon': task['icon'] ?? '📋',
        'date': fmtDate(dateStr),
        'status': status,
        'points': status == 'approved'
            ? ((s['points_awarded'] as int?) ?? (task['points'] as int?) ?? 0)
            : 0,
      });
    }

    // Merge missed transactions, filtering to on/after challenge start
    for (final t in missedTxns) {
      final createdAt = t['created_at'] as String? ?? '';
      if (startDate != null && createdAt.isNotEmpty) {
        final d = DateTime.tryParse(createdAt);
        if (d != null && d.isBefore(DateTime(startDate.year, startDate.month, startDate.day))) {
          continue; // skip entries before this challenge started
        }
      }

      // Try to get title/icon from joined task_submission
      final sub = t['task_submissions'] as Map?;
      final task = sub?['tasks'] as Map?;
      final subDate = sub?['submitted_date'] as String? ?? '';
      final dateForWeek = subDate.isNotEmpty ? subDate : createdAt;

      String title = task?['title'] as String? ?? '';
      if (title.isEmpty) {
        // Fall back: parse "Task missed: Meal Photo (2026-04-15)" → "Meal Photo"
        final reason = t['reason'] as String? ?? '';
        title = reason
            .replaceFirst(RegExp(r'^Task missed:\s*', caseSensitive: false), '')
            .replaceAll(RegExp(r'\s*\(\d{4}-\d{2}-\d{2}\)\s*$'), '')
            .trim();
      }
      final icon = task?['icon'] as String? ?? '📋';
      final basePts = task?['points'] as int? ?? 0;
      final week = weekFor(dateForWeek.isNotEmpty ? dateForWeek : createdAt);

      grouped.putIfAbsent(week, () => []).add({
        'title': title,
        'icon': icon,
        'date': fmtDate(subDate.isNotEmpty ? subDate : createdAt),
        'status': 'missed',
        'points': basePts, // base task points (not earned — earned stays 0 for missed)
      });
    }

    return (grouped, startDate);
  }
}
