import 'package:supabase_flutter/supabase_flutter.dart';

class InviteService {
  static final _client = Supabase.instance.client;

  /// Adds an email to invite_whitelist for the given org + team.
  /// Returns null on success, or a human-readable error string.
  static Future<String?> inviteMember({
    required String email,
    required String orgId,
    required String? teamId,
    required String invitedBy,
  }) async {
    final cleanEmail = email.trim().toLowerCase();

    // ── 1. Check if this email already has a profile (already signed up) ──
    final existing = await _client
        .from('profiles')
        .select('id, org_id, organizations(name)')
        .eq('email', cleanEmail)
        .maybeSingle();

    if (existing != null) {
      final profileOrgId = existing['org_id'] as String?;
      if (profileOrgId != null && profileOrgId != orgId) {
        final orgName =
            (existing['organizations'] as Map?)?['name'] as String? ??
                'another organisation';
        return 'This email is already a member of $orgName.';
      }
      if (profileOrgId == orgId) {
        return 'This person is already a member of your organisation.';
      }
    }

    // ── 2. Check if already invited to a different org ──
    final otherInvite = await _client
        .from('invite_whitelist')
        .select('org_id, organizations(name)')
        .eq('email', cleanEmail)
        .isFilter('used_at', null)
        .neq('org_id', orgId)
        .maybeSingle();

    if (otherInvite != null) {
      final orgName =
          (otherInvite['organizations'] as Map?)?['name'] as String? ??
              'another organisation';
      return 'This email already has a pending invite for $orgName.';
    }

    // ── 3. Insert invite (unique constraint on org_id+email handles duplicates) ──
    try {
      await _client.from('invite_whitelist').insert({
        'email': cleanEmail,
        'org_id': orgId,
        'team_id': (teamId != null && teamId.isNotEmpty) ? teamId : null,
        'role': 'member',
        'invited_by': (invitedBy.isNotEmpty) ? invitedBy : null,
      });
      return null;
    } on PostgrestException catch (e) {
      if (e.code == '23505') {
        return 'This email has already been invited to your organisation.';
      }
      return e.message;
    } catch (e) {
      return e.toString();
    }
  }
}
