import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/task_service.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/widgets/points_badge.dart';

class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _tasks = [];
  List<Map<String, dynamic>> _submissions = [];
  String? _profileId;
  String? _orgId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final authId = Supabase.instance.client.auth.currentUser?.id;
    if (authId == null) return;

    try {
      final profile = await ProfileService.getProfile(authId);
      if (profile == null) return;

      final tasks = await TaskService.getActiveTasks(profile['org_id']);
      final subs = await TaskService.getUserSubmissions(profile['id'], profile['org_id']);

      if (mounted) {
        setState(() {
          _profileId = profile['id'];
          _orgId = profile['org_id'];
          _tasks = tasks;
          _submissions = subs;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _submissionStatus(String taskId) {
    final match = _submissions.where((s) => s['task_id'] == taskId).toList();
    if (match.isEmpty) return 'not_submitted';
    return match.first['status'] as String? ?? 'pending';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(child: CircularProgressIndicator(color: AppColors.primary)),
      );
    }

    // Group tasks by week
    final Map<int, List<Map<String, dynamic>>> byWeek = {};
    for (final t in _tasks) {
      final w = t['week_number'] as int? ?? 1;
      byWeek.putIfAbsent(w, () => []).add(t);
    }
    final weeks = byWeek.keys.toList()..sort();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Tasks'),
        backgroundColor: AppColors.surface,
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.primary,
        child: _tasks.isEmpty
            ? const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('🎉', style: TextStyle(fontSize: 48)),
                    SizedBox(height: 12),
                    Text('No active tasks right now.',
                        style: TextStyle(color: AppColors.textSecondary, fontSize: 16)),
                  ],
                ),
              )
            : ListView.builder(
                padding: const EdgeInsets.all(20),
                itemCount: weeks.length,
                itemBuilder: (context, idx) {
                  final week = weeks[idx];
                  final weekTasks = byWeek[week]!;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: EdgeInsets.only(bottom: 12, top: idx == 0 ? 0 : 20),
                        child: Text('Week $week',
                            style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textSecondary,
                                letterSpacing: 0.5)),
                      ),
                      ...weekTasks.map((task) {
                        final status = _submissionStatus(task['id']);
                        return _TaskCard(
                          task: task,
                          status: status,
                          profileId: _profileId ?? '',
                          orgId: _orgId ?? '',
                          onDone: _load,
                        );
                      }),
                    ],
                  );
                },
              ),
      ),
    );
  }
}

class _TaskCard extends StatelessWidget {
  final Map<String, dynamic> task;
  final String status;
  final String profileId;
  final String orgId;
  final VoidCallback onDone;

  const _TaskCard({
    required this.task,
    required this.status,
    required this.profileId,
    required this.orgId,
    required this.onDone,
  });

  Color get _statusColor {
    switch (status) {
      case 'approved': return AppColors.success;
      case 'pending': return AppColors.pending;
      case 'rejected': return AppColors.rejected;
      default: return AppColors.textHint;
    }
  }

  String get _statusLabel {
    switch (status) {
      case 'approved': return '✓ Approved';
      case 'pending': return '⏳ Submitted';
      case 'rejected': return '✗ Rejected';
      default: return 'Submit';
    }
  }

  bool get _canSubmit => status == 'not_submitted' || status == 'rejected';

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _canSubmit
          ? () async {
              await context.push('/tasks/submit', extra: {
                'task': task,
                'profileId': profileId,
                'orgId': orgId,
              });
              onDone();
            }
          : null,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: _canSubmit ? AppColors.border : _statusColor.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.primarySurface,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Center(
                child: Text(task['icon'] as String? ?? '📋',
                    style: const TextStyle(fontSize: 24)),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(task['title'] as String? ?? '',
                      style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                          color: AppColors.textPrimary)),
                  if ((task['description'] as String? ?? '').isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(task['description'] as String,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.textSecondary)),
                  ],
                  const SizedBox(height: 6),
                  PointsBadge(points: task['points'] as int? ?? 0, fontSize: 11),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: _canSubmit
                    ? AppColors.primary
                    : _statusColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                _statusLabel,
                style: TextStyle(
                    color: _canSubmit ? Colors.white : _statusColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
