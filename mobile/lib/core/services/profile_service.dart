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
  ///
  /// Cleans up the user's previous avatar files in the same folder so storage
  /// doesn't accumulate orphans. New filename is timestamped so the URL is
  /// unique — browsers bypass the 1-year cache automatically.
  static Future<String> uploadAvatar(String profileId, XFile imageFile) async {
    if (_client.auth.currentSession == null) {
      throw AuthException('Session expired — please log in again.');
    }
    final ext = p.extension(imageFile.name).toLowerCase();
    // Storage policy requires folder = auth.uid(), not profiles.id
    final authUid = _client.auth.currentUser!.id;
    final newFileName = '${DateTime.now().millisecondsSinceEpoch}$ext';
    final path = '$authUid/$newFileName';
    final bytes = await imageFile.readAsBytes();
    final mime = switch (ext) {
      '.png' => 'image/png', '.gif' => 'image/gif', '.webp' => 'image/webp', _ => 'image/jpeg'
    };

    await _client.storage.from('avatars').uploadBinary(
      path,
      bytes,
      // cacheControl: 1 year — avatars never change at the same URL (filename
      // includes a timestamp), so we let browsers + Supabase CDN cache hard.
      // Single biggest egress lever on the project.
      fileOptions: FileOptions(
        upsert: false,
        contentType: mime,
        cacheControl: '31536000',
      ),
    );

    final publicUrl = _client.storage.from('avatars').getPublicUrl(path);

    await _client
        .from('profiles')
        .update({'avatar_url': publicUrl})
        .eq('id', profileId);

    // Best-effort cleanup of older avatars in this user's folder. Runs after
    // the new one is in place so failure here doesn't break the update.
    try {
      final existing = await _client.storage.from('avatars').list(path: authUid);
      final stale = existing
          .where((f) => f.name != newFileName)
          .map((f) => '$authUid/${f.name}')
          .toList();
      if (stale.isNotEmpty) {
        await _client.storage.from('avatars').remove(stale);
      }
    } catch (_) {
      // Don't surface — the new avatar is already live.
    }

    return publicUrl;
  }

  /// Fetch all points transactions for a user, most recent first.
  static Future<List<Map<String, dynamic>>> getPointsHistory(String userId) async {
    final data = await _client
        .from('points_transactions')
        .select('''
          id, amount, reason, is_manual, created_at,
          task_submissions(
            submitted_date,
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
