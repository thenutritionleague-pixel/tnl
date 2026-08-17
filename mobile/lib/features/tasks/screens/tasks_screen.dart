import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/task_service.dart';
import '../../../core/models/submission_state.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/utils/session_mixin.dart';
import '../../../core/utils/org_date_utils.dart';
import '../../../core/theme/theme_colors.dart';

class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});
  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen>
    with SessionAwareMixin {
  bool _loading = true;
  bool _loadError = false;
  List<Map<String, dynamic>> _tasks = [];
  List<Map<String, dynamic>> _submissions = [];
  String? _profileId;
  String? _orgId;
  String _orgTimezone = 'UTC';
  /// 'week' for city events (a new task each week), 'day' for National (a new
  /// task each day). Only affects wording — grouping is by week_number either way.
  String _periodLabel = 'week';
  int? _selectedWeek; // null = show all
  Timer? _timer;
  Timer? _pendingRefreshTimer;
  Duration _untilMidnight = Duration.zero;

  @override
  void initState() {
    super.initState();
    waitForSession(then: _load);
    _startCountdown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pendingRefreshTimer?.cancel();
    super.dispose();
  }

  /// 'Week' or 'Day', capitalised for display.
  String _periodWord() => _periodLabel == 'day' ? 'Day' : 'Week';

  void _startCountdown() {
    _updateCountdown();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) => _updateCountdown());
  }

  void _updateCountdown() {
    if (mounted) setState(() => _untilMidnight = untilOrgMidnight(_orgTimezone));
  }

  /// Silently re-fetch only submissions (no loading spinner) to pick up
  /// AI approval/rejection that happened after the initial load.
  Future<void> _refreshSubmissions() async {
    final authId = Supabase.instance.client.auth.currentUser?.id;
    if (authId == null || _profileId == null || _orgId == null) return;
    try {
      final subs = await TaskService.getUserSubmissions(_profileId!, _orgId!);
      if (mounted) setState(() => _submissions = subs);
      _schedulePendingRefresh();
    } catch (_) {}
  }

  /// Keep polling every 30 s while a today-submission is still being CHECKED.
  ///
  /// Deliberately not "pending": a submission the AI handed to a human keeps
  /// status='pending' until an admin acts, which can be hours. Re-arming a 30 s
  /// timer for that across ~1,000 members is constant needless load for a state
  /// that will not change on its own.
  void _schedulePendingRefresh() {
    _pendingRefreshTimer?.cancel();
    final todayStr = orgEffectiveTodayStr(_orgTimezone);
    final hasChecking = _submissions.any((s) =>
        (s['submitted_date'] as String?) == todayStr &&
        submissionStateFrom(s['status'] as String?, s['ai_status'] as String?)
            .worthPolling);
    if (!hasChecking) return;
    _pendingRefreshTimer = Timer(const Duration(seconds: 30), _refreshSubmissions);
  }

  Future<void> _load() async {
    if (mounted) setState(() { _loading = true; _loadError = false; });
    final authId = Supabase.instance.client.auth.currentUser?.id;
    if (authId == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    try {
      final profile = await ProfileService.getProfile(authId);
      if (profile == null) { if (mounted) setState(() => _loading = false); return; }

      final teamMembership = await ProfileService.getTeamMembership(profile['id'], profile['org_id']);
      dynamic firstIfList(dynamic v) => (v is List) ? (v.isNotEmpty ? v.first : null) : v;
      final team = firstIfList(teamMembership?['teams']);
      final teamId = team?['id'] as String?;
      final org = firstIfList(profile['organizations']);
      final orgTz = (org?['timezone'] as String?) ?? 'UTC';

      final tasks = await TaskService.getActiveTasks(profile['org_id'], teamId);
      final subs = await TaskService.getUserSubmissions(profile['id'], profile['org_id']);
      final periodLabel = await TaskService.getPeriodLabel(profile['org_id']);

      if (mounted) {
        setState(() {
          _profileId = profile['id'];
          _orgId = profile['org_id'];
          _orgTimezone = orgTz;
          _periodLabel = periodLabel;
          _tasks = tasks;
          _submissions = subs;
          _loading = false;
          _loadError = false;
        });
        _updateCountdown();
        _schedulePendingRefresh();
      }
    } catch (e) {
      debugPrint('TASKS_LOAD_ERROR: $e');
      if (handleLoadError(e)) return;
      if (mounted) setState(() { _loading = false; _loadError = true; });
    }
  }

  /// Returns today's submission status for a specific task.
  /// Uses the grace-aware effective date so a 00:00–00:14 submission
  /// (stored as yesterday by the DB trigger) is correctly matched.
  SubmissionState _submissionState(String taskId) {
    final todayStr = orgEffectiveTodayStr(_orgTimezone);
    final todayMatch = _submissions.where(
      (s) => s['task_id'] == taskId && (s['submitted_date'] as String?) == todayStr,
    ).toList();
    if (todayMatch.isEmpty) return SubmissionState.notSubmitted;
    // Sort by submitted_at descending to get the latest one (handles multiple today)
    todayMatch.sort((a, b) =>
        (b['submitted_at'] as String? ?? '').compareTo(a['submitted_at'] as String? ?? ''));
    return submissionStateFrom(
      todayMatch.first['status'] as String?,
      todayMatch.first['ai_status'] as String?,
    );
  }

  /// Returns the rejection reason only if TODAY's submission is rejected.
  String? _rejectionReason(String taskId) {
    final todayStr = orgEffectiveTodayStr(_orgTimezone);
    final todayMatch = _submissions.where(
      (s) => s['task_id'] == taskId && (s['submitted_date'] as String?) == todayStr,
    ).toList();
    if (todayMatch.isEmpty) return null;
    todayMatch.sort((a, b) =>
        (b['submitted_at'] as String? ?? '').compareTo(a['submitted_at'] as String? ?? ''));
    final first = todayMatch.first;
    if ((first['status'] as String?) == 'rejected') {
      return first['rejection_reason'] as String?;
    }
    return null;
  }

  // Returns grouped tasks by week, optionally filtered
  Map<int, List<Map<String, dynamic>>> get _grouped {
    final Map<int, List<Map<String, dynamic>>> result = {};
    for (final t in _tasks) {
      final w = t['week_number'] as int? ?? 1;
      if (_selectedWeek != null && w != _selectedWeek) continue;
      result.putIfAbsent(w, () => []).add(t);
    }
    return result;
  }

  List<int> get _weeks {
    final ws = _tasks.map((t) => t['week_number'] as int? ?? 1).toSet().toList()..sort();
    return ws;
  }

  int get _todayCount => _tasks.length;

  String _countdownLabel() {
    final h = _untilMidnight.inHours;
    final m = _untilMidnight.inMinutes % 60;
    return '${h}h ${m}m until midnight';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _TaskSkeleton();

    final weeks = _weeks;
    final grouped = _grouped;
    final sortedWeeks = grouped.keys.toList()..sort();

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.primary,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // ── Header ─────────────────────────────────────────────
            SliverToBoxAdapter(
              child: Container(
                color: Theme.of(context).colorScheme.surface,
                padding: EdgeInsets.only(
                  top: MediaQuery.of(context).padding.top + 16,
                  left: 18, right: 18, bottom: 0,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            "Today's Tasks",
                            style: GoogleFonts.instrumentSerif(fontSize: 36, color: context.textPrimary),
                          ),
                        ),
                        GestureDetector(
                          onTap: () => context.push('/tasks/history'),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: const [
                                Icon(Icons.history_rounded, size: 14, color: AppColors.primary),
                                SizedBox(width: 4),
                                Text(
                                  'History',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // Countdown banner
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.access_time, color: Colors.white60, size: 16),
                          const SizedBox(width: 8),
                          const Text('Daily deadline', style: TextStyle(color: Colors.white60, fontSize: 13)),
                          const Spacer(),
                          Text(
                            _countdownLabel(),
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Week filter tabs
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _WeekTab(
                            label: 'All (${_tasks.length})',
                            selected: _selectedWeek == null,
                            onTap: () => setState(() => _selectedWeek = null),
                          ),
                          ...weeks.map((w) => _WeekTab(
                            label: '${_periodWord()} $w',
                            selected: _selectedWeek == w,
                            onTap: () => setState(() => _selectedWeek = w),
                          )),
                        ],
                      ),
                    ),
                    const SizedBox(height: 6),
                  ],
                ),
              ),
            ),

            // ── Task list ────────────────────────────────────────────
            if (_loadError)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('😕', style: TextStyle(fontSize: 48)),
                      const SizedBox(height: 12),
                      Text('Could not load tasks.',
                          style: TextStyle(color: context.textSecondary, fontSize: 16)),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: _load,
                        child: const Text('Tap to retry'),
                      ),
                    ],
                  ),
                ),
              )
            else if (_tasks.isEmpty)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('🎉', style: TextStyle(fontSize: 48)),
                      SizedBox(height: 12),
                      Text('No active tasks right now.',
                          style: TextStyle(color: context.textSecondary, fontSize: 16)),
                    ],
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(0, 8, 0, 32),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    ...sortedWeeks.map((week) {
                      final weekTasks = grouped[week]!;
                      final completedCount = weekTasks.where((t) => _submissionState(t['id']).countsAsDone).length;
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _WeekHeader(
                            week: week,
                            periodWord: _periodWord(),
                            taskCount: weekTasks.length,
                            completedCount: completedCount,
                          ),
                          ...weekTasks.map((task) {
                            final status = _submissionState(task['id']);
                            final rejectionReason = _rejectionReason(task['id']);
                            return _TaskCard(
                              task: task,
                              status: status,
                              rejectionReason: rejectionReason,
                              profileId: _profileId ?? '',
                              orgId: _orgId ?? '',
                              orgTimezone: _orgTimezone,
                              onDone: _load,
                            );
                          }),
                        ],
                      );
                    }),
                  ]),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Week section header ──────────────────────────────────────────────────────

class _WeekHeader extends StatelessWidget {
  final int week;
  /// 'Week' or 'Day' — city events add a task each week, National each day.
  final String periodWord;
  final int taskCount;
  final int completedCount;
  const _WeekHeader({
    required this.week,
    required this.periodWord,
    required this.taskCount,
    required this.completedCount,
  });

  @override
  Widget build(BuildContext context) {
    final allDone = completedCount == taskCount && taskCount > 0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              'Since $periodWord $week',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
                letterSpacing: 0.3,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: Container(height: 1, color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.4))),
          const SizedBox(width: 10),
          Text(
            allDone ? '✓ All done' : '$completedCount / $taskCount done',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: allDone ? AppColors.success : context.textHint,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Week filter tab ─────────────────────────────────────────────────────────

class _WeekTab extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _WeekTab({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(right: 8, bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? AppColors.primary : Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: selected ? AppColors.primary : Theme.of(context).colorScheme.outline),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: selected ? Colors.white : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.65),
            ),
          ),
        ),
      );
}

// ── Task card ───────────────────────────────────────────────────────────────

class _TaskCard extends StatelessWidget {
  final Map<String, dynamic> task;
  final SubmissionState status;
  final String? rejectionReason;
  final String profileId;
  final String orgId;
  final String orgTimezone;
  final VoidCallback onDone;

  const _TaskCard({
    required this.task,
    required this.status,
    this.rejectionReason,
    required this.profileId,
    required this.orgId,
    required this.orgTimezone,
    required this.onDone,
  });

  Color get _statusColor => status.color;

  void _openSubmit(BuildContext context) async {
    if (isInSubmissionLockout(orgTimezone)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('🕐  Task submission opens at 4:00 AM. Try again then!',
              style: TextStyle(color: AppColors.surface, fontWeight: FontWeight.w600)),
          backgroundColor: AppColors.secondary,
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: 4),
        ),
      );
      return;
    }
    await context.push('/tasks/submit', extra: {
      'task': task,
      'profileId': profileId,
      'orgId': orgId,
      'orgTimezone': orgTimezone,
      'isResubmit': status == SubmissionState.rejected,
    });
    onDone();
  }

  String _fmtDate(String ymd) {
    try {
      final d = DateTime.parse(ymd);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${d.day} ${months[d.month - 1]}';
    } catch (_) {
      return ymd;
    }
  }

  @override
  Widget build(BuildContext context) {
    final title  = task['title']       as String? ?? '';
    final desc   = task['description'] as String? ?? '';
    final icon   = task['icon']        as String? ?? '📋';
    final canSubmit = status.canSubmit;
    final tiers = task['points_tiers'];
    final tiersList = tiers != null ? List<Map<String, dynamic>>.from(tiers as List) : null;
    final String pointsLabel = (tiersList != null && tiersList.isNotEmpty)
        ? '${tiersList.first['points']}–${tiersList.last['points']}'
        : '${task['points'] as int? ?? 0}';
    final effectiveDateLabel = _fmtDate(orgEffectiveTodayStr(orgTimezone));

    return GestureDetector(
      onTap: canSubmit ? () => _openSubmit(context) : null,
      child: Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: status == SubmissionState.rejected ? AppColors.rejected.withValues(alpha: 0.4) : Theme.of(context).colorScheme.outline,
          width: status == SubmissionState.rejected ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Icon
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Center(child: Text(icon, style: const TextStyle(fontSize: 22))),
                ),
                const SizedBox(width: 12),

                // Title + desc
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
                      if (desc.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          desc,
                          style: TextStyle(
                            fontSize: 12,
                            color: context.textHint,
                            height: 1.4,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 6),
                      // Points + date
                      Row(
                        children: [
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
                          const Spacer(),
                          Icon(Icons.calendar_today_rounded,
                              size: 10,
                              color: context.textHint),
                          const SizedBox(width: 3),
                          Text(
                            effectiveDateLabel,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                              color: context.textHint,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),

                // Action / status
                if (status == SubmissionState.approved ||
                    status == SubmissionState.checking ||
                    status == SubmissionState.inReview)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(status.icon, color: status.color, size: 16),
                      const SizedBox(width: 4),
                      Text(
                        status.label,
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: status.color),
                      ),
                    ],
                  )
                else if (canSubmit)
                  Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: _statusColor,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        status.label,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
              ],
            ),
          ),

          // ── Rejection reason banner ──────────────────────────────────────
          // The whole point of the In Review state: without a sentence here the
          // member just sees an amber chip and assumes the app is stuck.
          if (status == SubmissionState.inReview) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              decoration: BoxDecoration(
                color: AppColors.pending.withValues(alpha: 0.07),
                border: Border(
                  top: BorderSide(
                    color: AppColors.pending.withValues(alpha: 0.2),
                    width: 1,
                  ),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.visibility_outlined,
                      size: 14, color: AppColors.pending),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      status.detail,
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: AppColors.pending,
                        height: 1.45,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          if (status == SubmissionState.rejected) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              decoration: BoxDecoration(
                color: AppColors.rejected.withValues(alpha: 0.07),
                border: Border(
                  top: BorderSide(
                    color: AppColors.rejected.withValues(alpha: 0.2),
                    width: 1,
                  ),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.info_outline_rounded,
                      size: 14, color: AppColors.rejected),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      rejectionReason != null && rejectionReason!.isNotEmpty
                          ? 'Rejected: $rejectionReason'
                          : 'Your submission was rejected. Please resubmit with a valid proof photo.',
                      style: TextStyle(
                        fontSize: 11.5,
                        color: AppColors.rejected,
                        height: 1.45,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    ));
  }
}

// ── Skeleton loader ─────────────────────────────────────────────────────────

class _TaskSkeleton extends StatefulWidget {
  const _TaskSkeleton();
  @override
  State<_TaskSkeleton> createState() => _TaskSkeletonState();
}

class _TaskSkeletonState extends State<_TaskSkeleton> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;
  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000))..repeat(reverse: true);
    _anim = Tween<double>(begin: 0.3, end: 0.9).animate(_ctrl);
  }
  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  Widget _box({double h = 14, double? w, double r = 8}) => AnimatedBuilder(
    animation: _anim,
    builder: (_, __) => Container(
      height: h, width: w,
      decoration: BoxDecoration(
        color: Colors.grey.withValues(alpha: _anim.value * 0.22),
        borderRadius: BorderRadius.circular(r),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: SingleChildScrollView(
        physics: const NeverScrollableScrollPhysics(),
        child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            color: Theme.of(context).colorScheme.surface,
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _box(h: 22, w: 160),
                const SizedBox(height: 8),
                _box(h: 12, w: 200),
                const SizedBox(height: 14),
                _box(h: 56, r: 12),
                const SizedBox(height: 10),
                _box(h: 44, r: 12),
                const SizedBox(height: 12),
                Row(children: [_box(h: 34, w: 80, r: 20), const SizedBox(width: 8), _box(h: 34, w: 100, r: 20)]),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: _box(h: 11, w: 120),
          ),
          const SizedBox(height: 10),
          ...List.generate(3, (_) => Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: AnimatedBuilder(
              animation: _anim,
              builder: (_, __) => Container(
                height: 130,
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: _anim.value * 0.15),
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ),
          )),
        ],
        ),
      ),
    ),
  );
}
