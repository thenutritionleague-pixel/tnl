import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:supabase_flutter/supabase_flutter.dart';

class ProfileService {
  static final _client = Supabase.instance.client;

  /// Fetch the profile for the given auth ID (auth.users.id).
  static Future<Map<String, dynamic>?> getProfile(String authId) async {
    return await _client
        .from('profiles')
        .select('''
          id, auth_id, org_id, name, email, avatar_color, avatar_url,
          total_points, created_at, is_test,
          organizations(id, name, slug, logo, logo_url, timezone)
        ''')
        .eq('auth_id', authId)
        .maybeSingle();
  }

  /// Update the display name in the profiles table.
  static Future<void> updateName(String profileId, String name) async {
    await _client
        .from('profiles')
        .update({'name': name.trim()})
        .eq('id', profileId);
  }

  /// Sync the email field in profiles after a confirmed auth email change.
  static Future<void> updateEmail(String profileId, String email) async {
    await _client
        .from('profiles')
        .update({'email': email.trim()})
        .eq('id', profileId);
  }

  /// Upload a new avatar image and save the public URL to the profile.
  /// Returns the new public URL.
  static Future<String> uploadAvatar(String profileId, XFile imageFile) async {
    final ext = p.extension(imageFile.name).toLowerCase();
    final path = '$profileId/${DateTime.now().millisecondsSinceEpoch}$ext';
    final bytes = await imageFile.readAsBytes();
    final mime = switch (ext) {
      '.png' => 'image/png', '.gif' => 'image/gif', '.webp' => 'image/webp', _ => 'image/jpeg'
    };

    await _client.storage.from('avatars').uploadBinary(
      path,
      bytes,
      fileOptions: FileOptions(upsert: true, contentType: mime),
    );

    final publicUrl = _client.storage.from('avatars').getPublicUrl(path);

    await _client
        .from('profiles')
        .update({'avatar_url': publicUrl})
        .eq('id', profileId);

    return publicUrl;
  }

  /// Fetch all points transactions for a user, most recent first.
  static Future<List<Map<String, dynamic>>> getPointsHistory(String userId) async {
    final data = await _client
        .from('points_transactions')
        .select('''
          id, amount, reason, is_manual, created_at,
          task_submissions(
            submitted_at,
            tasks(title)
          )
        ''')
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

  /// Fetch an invite whitelist entry by email (any status).
  static Future<Map<String, dynamic>?> getInvite(String email) async {
    return await _client
        .from('invite_whitelist')
        .select('id, org_id, team_id, role, used_at')
        .eq('email', email.trim())
        .maybeSingle();
  }
}
