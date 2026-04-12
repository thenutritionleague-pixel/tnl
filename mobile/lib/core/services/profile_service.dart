import 'package:supabase_flutter/supabase_flutter.dart';

class ProfileService {
  static final _client = Supabase.instance.client;

  /// Fetch the profile for the given auth ID (auth.users.id).
  static Future<Map<String, dynamic>?> getProfile(String authId) async {
    return await _client
        .from('profiles')
        .select('''
          id, auth_id, org_id, name, email, avatar_color,
          total_points, created_at, is_test,
          organizations!profiles_org_id_fkey(id, name, slug, logo, timezone)
        ''')
        .eq('auth_id', authId)
        .maybeSingle();
  }

  /// Fetch all points transactions for a user, most recent first.
  static Future<List<Map<String, dynamic>>> getPointsHistory(String userId) async {
    final data = await _client
        .from('points_transactions')
        .select('id, amount, reason, is_manual, created_at')
        .eq('user_id', userId)
        .order('created_at', ascending: false)
        .limit(50);
    return List<Map<String, dynamic>>.from(data);
  }

  /// Get team membership for a profile user.
  static Future<Map<String, dynamic>?> getTeamMembership(String profileId) async {
    return await _client
        .from('team_members')
        .select('''
          role,
          teams!team_members_team_id_fkey(id, name, emoji, color)
        ''')
        .eq('user_id', profileId)
        .maybeSingle();
  }

  /// Create a new profile (first login from invite whitelist).
  static Future<Map<String, dynamic>> createProfile({
    required String authId,
    required String orgId,
    required String name,
    required String email,
  }) async {
    // Pick a random avatar color
    const colors = [
      '#059669', '#3B82F6', '#8B5CF6', '#F59E0B',
      '#EF4444', '#EC4899', '#14B8A6', '#F97316',
    ];
    colors.shuffle();
    final avatarColor = colors.first;

    final data = await _client
        .from('profiles')
        .update({
          'org_id': orgId,
          'name': name.trim(),
          'email': email.trim(),
          'avatar_color': avatarColor,
        })
        .eq('auth_id', authId)
        .select()
        .single();
    return data;
  }

  /// Fetch an invite whitelist entry by email (unused only).
  static Future<Map<String, dynamic>?> getInvite(String email) async {
    return await _client
        .from('invite_whitelist')
        .select('id, org_id, team_id, role')
        .eq('email', email.trim())
        .isFilter('used_at', null)
        .maybeSingle();
  }

  /// Mark an invite as used.
  static Future<void> markInviteUsed(String inviteId) async {
    await _client
        .from('invite_whitelist')
        .update({'used_at': DateTime.now().toIso8601String()})
        .eq('id', inviteId);
  }
}
