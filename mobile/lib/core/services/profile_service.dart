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

  /// Claim an invite atomically via RPC (creates profile, assigns team, marks invite).
  static Future<Map<String, dynamic>> claimInvite({
    required String authId,
    required String email,
    required String name,
    required String orgId,
    String? inviteId,
    String? teamId,
  }) async {
    final response = await _client.rpc('claim_user_invite', params: {
      'p_auth_id': authId,
      'p_email': email.trim(),
      'p_name': name.trim(),
      'p_org_id': orgId,
      'p_invite_id': inviteId,
      'p_team_id': teamId,
    });
    return response as Map<String, dynamic>;
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
}
