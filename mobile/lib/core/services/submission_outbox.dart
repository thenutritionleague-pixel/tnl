import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Local durable "outbox" for task submissions.
///
/// The proof photo/video is uploaded to storage FIRST, then the submission row
/// is inserted. If the insert fails (network blip, expired session) or the
/// member closes the app in between, the upload is orphaned and the submission
/// is silently lost — the member sees "missing" later.
///
/// This outbox closes that gap: the moment the upload succeeds we persist the
/// pending insert to local storage (SharedPreferences → localStorage on web),
/// so it is NEVER lost. It is retried immediately and, if that still fails,
/// auto-completed on the next app launch. Idempotent: it never creates a
/// duplicate (checks proof_url + relies on the DB's one-per-day unique index).
class SubmissionOutbox {
  static const _key = 'pending_submissions_v1';
  static final _client = Supabase.instance.client;

  static Future<List<Map<String, dynamic>>> _readAll() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? const [];
    final out = <Map<String, dynamic>>[];
    for (final s in raw) {
      try {
        out.add(jsonDecode(s) as Map<String, dynamic>);
      } catch (_) {/* skip corrupt entry */}
    }
    return out;
  }

  static Future<void> _writeAll(List<Map<String, dynamic>> items) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, items.map(jsonEncode).toList());
  }

  /// Queue a pending submission (keyed by proof_url). Call right AFTER the proof
  /// upload succeeds and BEFORE attempting the insert.
  static Future<void> enqueue(Map<String, dynamic> record) async {
    final items = await _readAll();
    items.removeWhere((r) => r['proof_url'] == record['proof_url']);
    items.add(record);
    await _writeAll(items);
  }

  /// Remove a completed (or duplicate) submission from the outbox.
  static Future<void> remove(String proofUrl) async {
    final items = await _readAll();
    items.removeWhere((r) => r['proof_url'] == proofUrl);
    await _writeAll(items);
  }

  /// True if anything is still pending (used for a subtle UI hint if desired).
  static Future<bool> hasPending() async => (await _readAll()).isNotEmpty;

  /// Build the DB insert payload from a queued record.
  static Map<String, dynamic> buildInsertPayload(Map<String, dynamic> r) => {
        'task_id': r['task_id'],
        if (r['challenge_id'] != null) 'challenge_id': r['challenge_id'],
        'user_id': r['user_id'],
        'org_id': r['org_id'],
        'submitted_at': r['submitted_at'],
        if (r['submitted_date'] != null) 'submitted_date': r['submitted_date'],
        'status': 'pending',
        'proof_url': r['proof_url'],
        if (r['task_snapshot'] != null) 'task_snapshot': r['task_snapshot'],
        if (r['note'] != null) 'note': r['note'],
        if (r['selected_tier_index'] != null)
          'selected_tier_index': r['selected_tier_index'],
      };

  /// Attempt to complete every pending submission. Safe to call on each app
  /// launch — idempotent, best-effort, and never throws.
  static Future<void> flush() async {
    List<Map<String, dynamic>> items;
    try {
      items = await _readAll();
    } catch (_) {
      return;
    }
    if (items.isEmpty) return;
    // Need a valid session to write. If none, leave everything for next launch.
    if (_client.auth.currentSession == null) return;

    for (final record in items) {
      final proofUrl = record['proof_url'] as String?;
      if (proofUrl == null) continue;
      try {
        // Already inserted before (success then clear crashed)? Skip.
        final existing = await _client
            .from('task_submissions')
            .select('id')
            .eq('proof_url', proofUrl)
            .limit(1)
            .maybeSingle();
        if (existing != null) {
          await remove(proofUrl);
          continue;
        }
        await _client
            .from('task_submissions')
            .insert(buildInsertPayload(record));
        await remove(proofUrl);
      } on PostgrestException catch (e) {
        // 23505 = one-per-day unique index → a submission already exists → done.
        if (e.code == '23505') await remove(proofUrl);
        // other Postgrest errors: leave queued, retry next launch
      } catch (_) {
        // network / transient: leave queued, retry next launch
      }
    }
  }
}
