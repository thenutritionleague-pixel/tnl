import 'package:supabase_flutter/supabase_flutter.dart';

class LeaderboardService {
  static final _client = Supabase.instance.client;

  /// Get team leaderboard using the team_points_view.
  /// Returns teams sorted by total_points descending.
  static Future<List<Map<String, dynamic>>> getTeamLeaderboard(
    String orgId,
    String challengeId,
  ) async {
    if (challengeId.isEmpty) return [];

    final data = await _client
        .from('team_points_view')
        .select('team_id, total_points')
        .eq('challenge_id', challengeId)
        .order('total_points', ascending: false);

    final teamIds = (data as List).map((r) => r['team_id']).toList();
    if (teamIds.isEmpty) return [];

    // Fetch team details
    final teams = await _client
        .from('teams')
        .select('id, name, emoji, color')
        .inFilter('id', teamIds)
        .eq('org_id', orgId);

    final teamMap = {for (final t in teams) t['id']: t};

    return data.map<Map<String, dynamic>>((row) {
      final team = teamMap[row['team_id']] ?? {};
      return {
        'team_id': row['team_id'],
        'total_points': row['total_points'],
        'name': team['name'] ?? '',
        'emoji': team['emoji'] ?? '🏃',
        'color': team['color'] ?? '#059669',
      };
    }).toList();
  }

  /// Get individual member leaderboard.
  /// Returns members sorted by total_points descending.
  static Future<List<Map<String, dynamic>>> getMemberLeaderboard(
    String orgId,
  ) async {
    final data = await _client
        .from('profiles')
        .select('id, name, avatar_color, total_points, team_members!team_members_user_id_fkey(teams!team_members_team_id_fkey(name, emoji))')
        .eq('org_id', orgId)
        .order('total_points', ascending: false);

    return List<Map<String, dynamic>>.from(data);
  }
}
