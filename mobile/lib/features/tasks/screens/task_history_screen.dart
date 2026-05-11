import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/task_service.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/utils/session_mixin.dart';
import '../../../core/theme/theme_colors.dart';

class TaskHistoryScreen extends StatefulWidget {
  const TaskHistoryScreen({super.key});

  @override
  State<TaskHistoryScreen> createState() => _TaskHistoryScreenState();
}

class _TaskHistoryScreenState extends State<TaskHistoryScreen>
    with SessionAwareMixin {
  bool _loading = true;
  List<Map<String, dynamic>> _history = [];
  String? _profileId;
  String? _orgId;
  String _orgTimezone = 'UTC';

  @override
  void initState() {
    super.initState();
    waitForSession(then: _load);
  }

  Future<void> _load() async {
    final authId = Supabase.instance.client.auth.currentUser?.id;
    if (authId == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    try {
      final profile = await ProfileService.getProfile(authId);
      if (profile == null) {
        if (mounted) setState(() => _loading = false);
        return;
      }
      dynamic firstIfList(dynamic v) => (v is List) ? (v.isNotEmpty ? v.first : null) : v;
      final org = firstIfList(profile['organizations']);
      final orgTz = (org?['timezone'] as String?) ?? 'UTC';
      final subs = await TaskService.getPastSubmissions(
        profile['id'] as String,
        profile['org_id'] as String,
        orgTimezone: orgTz,
      );
      if (mounted) {
        setState(() {
          _profileId = profile['id'] as String;
          _orgId = profile['org_id'] as String;
          _orgTimezone = orgTz;
          _history = subs;
          _loading = false;
        });
      }
    } catch (e) {
      debugPrint('TASK_HISTORY_LOAD_ERROR: $e');
      if (handleLoadError(e)) return;
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.primary,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // ── Header ───────────────────────────────────────────────
            SliverToBoxAdapter(
              child: Container(
                color: Theme.of(context).colorScheme.surface,
                padding: EdgeInsets.only(
                  top: MediaQuery.of(context).padding.top + 16,
                  left: 18,
                  right: 18,
                  bottom: 16,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        GestureDetector(
                          onTap: () => context.pop(),
                          child: Icon(Icons.arrow_back_ios_new_rounded,
                              size: 18, color: context.textPrimary),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          'Task History',
                          style: GoogleFonts.instrumentSerif(
                            fontSize: 36,
                            color: context.textPrimary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Tasks from previous days pending review or open for resubmission.',
                      style: TextStyle(
                        fontSize: 13,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            if (_loading)
              const SliverFillRemaining(
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
              )
            else if (_history.isEmpty)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('✅', style: TextStyle(fontSize: 48)),
                      SizedBox(height: 12),
                      Text(
                        'All caught up!',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'No tasks from previous days need resubmission.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          color: context.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(0, 8, 0, 32),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, i) => _HistoryCard(
                      submission: _history[i],
                      profileId: _profileId ?? '',
                      orgId: _orgId ?? '',
                      orgTimezone: _orgTimezone,
                      onDone: _load,
                    ),
                    childCount: _history.length,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── History card ─────────────────────────────────────────────────────────────

class _HistoryCard extends StatelessWidget {
  final Map<String, dynamic> submission;
  final String profileId;
  final String orgId;
  final String orgTimezone;
  final VoidCallback onDone;

  const _HistoryCard({
    required this.submission,
    required this.profileId,
    required this.orgId,
    required this.orgTimezone,
    required this.onDone,
  });

  @override
  Widget build(BuildContext context) {
    // Prefer the snapshot frozen at submission time; fall back to the live task join
    final liveTask = submission['tasks'] as Map<String, dynamic>? ?? const {};
    final snap = submission['task_snapshot'] as Map<String, dynamic>?;
    final task = snap ?? liveTask;

    final status = submission['status']         as String? ?? '';
    final date   = submission['submitted_date'] as String? ?? '';
    final reason = submission['rejection_reason'] as String?;
    final title  = (task['title']       as String?) ?? (liveTask['title']       as String?) ?? '—';
    final desc   = (task['description'] as String?) ?? (liveTask['description'] as String?) ?? '';
    final icon   = (task['icon']        as String?) ?? (liveTask['icon']        as String?) ?? '📋';

    // Prefer the snapshotted claimed tier; fall back to tier-range from current task
    final selectedTier = task['selected_tier'] as Map<String, dynamic>?;
    final tiersRaw = task['points_tiers'] ?? liveTask['points_tiers'];
    final tiersList = (tiersRaw is List && tiersRaw.isNotEmpty)
        ? List<Map<String, dynamic>>.from(tiersRaw.whereType<Map>().map((m) => Map<String, dynamic>.from(m)))
        : null;
    final String pointsLabel = selectedTier != null
        ? '${selectedTier['points']}'
        : (tiersList != null && tiersList.isNotEmpty)
            ? '${tiersList.first['points']}–${tiersList.last['points']}'
            : '${(task['points'] as int?) ?? (liveTask['points'] as int?) ?? 0}';

    // Only show the rejection reason when the admin gave one.
    // Expired is an internal status — we never surface that word to the member.
    final hasRejectionReason =
        status == 'rejected' && reason != null && reason.isNotEmpty;

    // Format date for display
    String displayDate = date;
    try {
      final d = DateTime.parse(date);
      final months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      displayDate = '${months[d.month - 1]} ${d.day}';
    } catch (_) {}

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.borderColor, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Task icon
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Center(
                    child: Text(icon, style: const TextStyle(fontSize: 22)),
                  ),
                ),
                const SizedBox(width: 12),

                // Title + date
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                          height: 1.3,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          Icon(Icons.calendar_today_outlined,
                              size: 11, color: context.textHint),
                          const SizedBox(width: 3),
                          Text(
                            displayDate,
                            style: TextStyle(
                              fontSize: 11,
                              color: context.textHint,
                            ),
                          ),
                          const SizedBox(width: 10),
                          const Text('🥦', style: TextStyle(fontSize: 11)),
                          const SizedBox(width: 3),
                          Text(
                            pointsLabel,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.primary,
                            ),
                          ),
                        ],
                      ),
                      if (desc.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          desc,
                          style: TextStyle(
                            fontSize: 11.5,
                            color: context.textHint,
                            height: 1.4,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),

          // ── Bottom row: status-specific message + action ────────────
          Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
            decoration: BoxDecoration(
              color: status == 'pending'
                  ? (Theme.of(context).brightness == Brightness.dark ? const Color(0xFF2D2000) : const Color(0xFFFFF9EC))
                  : Theme.of(context).scaffoldBackgroundColor,
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(13)),
              border: Border(
                top: BorderSide(color: context.borderColor.withValues(alpha: 0.6)),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (status == 'pending') ...[
                        const Icon(Icons.hourglass_top_rounded,
                            size: 13, color: Color(0xFFB07D00)),
                        const SizedBox(width: 5),
                        const Expanded(
                          child: Text(
                            'Pending review by admin.',
                            style: TextStyle(
                              fontSize: 11.5,
                              color: Color(0xFFB07D00),
                              height: 1.4,
                            ),
                          ),
                        ),
                      ] else ...[
                        Expanded(
                          child: Text(
                            hasRejectionReason
                                ? 'Note: $reason'
                                : 'Tap Resubmit to send a new photo.',
                            style: TextStyle(
                              fontSize: 11.5,
                              color: hasRejectionReason
                                  ? AppColors.rejected
                                  : context.textSecondary,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (status == 'rejected') ...[
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: () async {
                      // Merge challenge_id so task_submission_screen has a valid UUID
                      final taskWithChallenge = Map<String, dynamic>.from(task)
                        ..['challenge_id'] = submission['challenge_id'] as String? ?? '';
                      await context.push('/tasks/submit', extra: {
                        'task': taskWithChallenge,
                        'profileId': profileId,
                        'orgId': orgId,
                        'orgTimezone': orgTimezone,
                        'isResubmit': true,
                        'submittedDate': date, // use original date
                      });
                      onDone();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'Resubmit',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
