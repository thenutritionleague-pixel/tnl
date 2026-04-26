import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:path/path.dart' as p;

class TaskService {
  static final _client = Supabase.instance.client;

  /// Get all active tasks for a team's active challenge, respecting week progressive unlocking.
  static Future<List<Map<String, dynamic>>> getActiveTasks(String orgId, String? teamId) async {
    if (teamId == null) return []; // Must belong to a team to see and do tasks
    
    final tasks = await _client.rpc('get_mobile_tasks', params: {
      'p_team_id': teamId,
      'p_org_id': orgId,
    });
    
    return List<Map<String, dynamic>>.from(tasks);
  }

  /// Get all submissions for a user in active challenges.
  static Future<List<Map<String, dynamic>>> getUserSubmissions(
    String userId,
    String orgId,
  ) async {
    final data = await _client
        .from('task_submissions')
        .select('id, task_id, status, submitted_at, submitted_date, points_awarded, rejection_reason')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .order('submitted_at', ascending: false);

    return List<Map<String, dynamic>>.from(data);
  }


  /// Upload an image proof and submit the task.
  /// [submittedDate] overrides the submission date (YYYY-MM-DD).
  /// Pass the original date when resubmitting a history item so the
  /// admin breakdown stays accurate.
  static Future<void> submitTaskImage({
    required String taskId,
    required String challengeId,
    required String userId,
    required String orgId,
    required XFile imageFile,
    String? submittedDate,
    String? note,
  }) async {
    final ext = p.extension(imageFile.name).toLowerCase();
    final fileName = 'proofs/$userId/${taskId}_${DateTime.now().millisecondsSinceEpoch}$ext';
    final bytes = await imageFile.readAsBytes();

    await _client.storage.from('task-proofs').uploadBinary(
      fileName,
      bytes,
      fileOptions: FileOptions(upsert: false, contentType: _mimeType(ext)),
    );

    // Use the provided date (history resubmit) or fall back to today (local)
    final dateStr = submittedDate ??
        DateTime.now().toLocal().toString().split(' ')[0];

    await _client.from('task_submissions').insert({
      'task_id': taskId,
      'challenge_id': challengeId,
      'user_id': userId,
      'org_id': orgId,
      'submitted_at': DateTime.now().toUtc().toIso8601String(),
      'submitted_date': dateStr,
      'status': 'pending',
      'proof_url': fileName,
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
    });
  }

  static String _mimeType(String ext) => switch (ext) {
    '.png'  => 'image/png',
    '.gif'  => 'image/gif',
    '.webp' => 'image/webp',
    _       => 'image/jpeg',
  };

  /// Get submissions from previous days (for Task History).
  /// Returns pending (awaiting review) and rejected submissions from before today.
  /// - pending: member already submitted, waiting for admin review (read-only card)
  /// - rejected: member can resubmit (shows Resubmit button)
  static Future<List<Map<String, dynamic>>> getPastSubmissions(
    String userId,
    String orgId,
  ) async {
    final todayStr = DateTime.now().toLocal().toString().split(' ')[0];

    final data = await _client
        .from('task_submissions')
        .select(
          'id, task_id, challenge_id, status, submitted_date, submitted_at, rejection_reason, '
          'tasks!task_id(id, title, description, icon, points)',
        )
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .inFilter('status', ['pending', 'rejected'])
        .neq('submitted_date', todayStr) // exclude today — handled by Tasks screen
        .order('submitted_date', ascending: false)
        .limit(60);

    return List<Map<String, dynamic>>.from(data);
  }

  /// Get a signed URL for a private task proof image.
  static Future<String> getProofSignedUrl(String path) async {
    return await _client.storage
        .from('task-proofs')
        .createSignedUrl(path, 3600);
  }
}
