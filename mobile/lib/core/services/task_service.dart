import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:path/path.dart' as p;

class TaskService {
  static final _client = Supabase.instance.client;

  /// Get all active tasks for an org's active challenge.
  static Future<List<Map<String, dynamic>>> getActiveTasks(String orgId) async {
    // First get active challenges for the org
    final challenges = await _client
        .from('challenges')
        .select('id')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .eq('manually_closed', false);

    if (challenges.isEmpty) return [];

    final challengeIds = (challenges as List).map((c) => c['id']).toList();

    final tasks = await _client
        .from('tasks')
        .select('id, challenge_id, title, description, points, week_number, category, icon, is_active')
        .inFilter('challenge_id', challengeIds)
        .eq('is_active', true)
        .order('week_number');

    return List<Map<String, dynamic>>.from(tasks);
  }

  /// Get all submissions for a user in active challenges.
  static Future<List<Map<String, dynamic>>> getUserSubmissions(
    String userId,
    String orgId,
  ) async {
    final data = await _client
        .from('task_submissions')
        .select('id, task_id, status, submitted_at, points_awarded, rejection_reason')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .order('submitted_at', ascending: false);

    return List<Map<String, dynamic>>.from(data);
  }

  /// Submit a text proof for a task.
  static Future<void> submitTaskText({
    required String taskId,
    required String challengeId,
    required String userId,
    required String orgId,
    required String text,
  }) async {
    await _client.from('task_submissions').insert({
      'task_id': taskId,
      'challenge_id': challengeId,
      'user_id': userId,
      'org_id': orgId,
      'submitted_at': DateTime.now().toIso8601String(),
      'submitted_date': DateTime.now().toIso8601String().substring(0, 10),
      'status': 'pending',
      'proof_type': 'text',
      'notes': text.trim(),
    });
  }

  /// Upload an image proof and submit the task.
  static Future<void> submitTaskImage({
    required String taskId,
    required String challengeId,
    required String userId,
    required String orgId,
    required File imageFile,
  }) async {
    final ext = p.extension(imageFile.path);
    final fileName = 'proofs/$userId/${taskId}_${DateTime.now().millisecondsSinceEpoch}$ext';

    await _client.storage.from('task-proofs').upload(
      fileName,
      imageFile,
      fileOptions: const FileOptions(upsert: false),
    );

    await _client.from('task_submissions').insert({
      'task_id': taskId,
      'challenge_id': challengeId,
      'user_id': userId,
      'org_id': orgId,
      'submitted_at': DateTime.now().toIso8601String(),
      'submitted_date': DateTime.now().toIso8601String().substring(0, 10),
      'status': 'pending',
      'proof_type': 'image',
      'proof_url': fileName,
    });
  }

  /// Get a signed URL for a private task proof image.
  static Future<String> getProofSignedUrl(String path) async {
    return await _client.storage
        .from('task-proofs')
        .createSignedUrl(path, 3600);
  }
}
