import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/services/task_service.dart';
import '../../../core/services/leaderboard_service.dart';
import '../../../core/utils/session_mixin.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin, SessionAwareMixin {
  bool _loading = true;
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _activeChallenge;
  List<Map<String, dynamic>> _tasks = [];
  List<Map<String, dynamic>> _submissions = [];
  List<Map<String, dynamic>> _teamLeaderboard = [];

  String? _teamId;

  @override
  void initState() {
    super.initState();
    waitForSession(then: _load); // Wait for token refresh before loading
  }

  Future<void> _load() async {
    final authId = Supabase.instance.client.auth.currentUser?.id;
    if (authId == null) {
      if (mounted) context.go('/login');
      return;
    }
    try {
      final profile = await ProfileService.getProfile(authId);
      if (profile == null || profile['org_id'] == null) {
        if (mounted) {
          setState(() => _loading = false);
          context.go('/signup');
        }
        return;
      }

      final teamMembership = await ProfileService.getTeamMembership(profile['id']);

      dynamic firstIfList(dynamic val) {
        if (val == null) return null;
        if (val is List) return val.isNotEmpty ? val.first : null;
        return val;
      }

      final org = firstIfList(profile['organizations']);
      final team = firstIfList(teamMembership?['teams']);
      final normalizedProfile = {...profile, 'organizations': org};

      final String? orgId = profile['org_id'];
      final String? teamId = team?['id'];

      // Load active challenge via SECURITY DEFINER RPC (bypasses RLS)
      Map<String, dynamic>? activeChallenge;
      List<Map<String, dynamic>> teamLeaderboard = [];
      if (orgId != null) {
        final challengeResult = await Supabase.instance.client
            .rpc('get_active_challenge', params: {'p_org_id': orgId});
        debugPrint('HOME_CHALLENGE_RPC: $challengeResult');
        final challengeList = challengeResult as List?;
        if (challengeList != null && challengeList.isNotEmpty) {
          activeChallenge = Map<String, dynamic>.from(challengeList.first);
          teamLeaderboard = await LeaderboardService.getTeamLeaderboard(orgId, activeChallenge['id']);
        }
      }

      final tasks = orgId != null ? await TaskService.getActiveTasks(orgId, teamId) : <Map<String, dynamic>>[];
      final submissions = orgId != null ? await TaskService.getUserSubmissions(profile['id'], orgId) : <Map<String, dynamic>>[];

      if (mounted) {
        setState(() {
          _profile = normalizedProfile;
          _activeChallenge = activeChallenge;
          _tasks = tasks;
          _submissions = submissions;
          _teamLeaderboard = teamLeaderboard.take(5).toList();
          _teamId = teamId;
          _loading = false;
        });
      }
    } catch (e) {
      debugPrint('HOME_LOAD_ERROR: $e');
      if (mounted) setState(() => _loading = false);
    }
  }

  String _submissionStatus(String taskId) {
    final match = _submissions.where((s) => s['task_id'] == taskId).toList();
    if (match.isEmpty) return 'none';
    return match.first['status'] as String? ?? 'pending';
  }

  int get _todayApproved {
    return _tasks.where((t) => _submissionStatus(t['id']) == 'approved').length;
  }

  int get _todayDonePct {
    if (_tasks.isEmpty) return 0;
    return ((_todayApproved / _tasks.length) * 100).round();
  }

  int get _teamRank {
    if (_teamId == null) return 0;
    final idx = _teamLeaderboard.indexWhere((t) => t['team_id'] == _teamId);
    return idx >= 0 ? idx + 1 : 0;
  }

  int get _teamPoints {
    if (_teamId == null) return 0;
    final t = _teamLeaderboard.firstWhere((t) => t['team_id'] == _teamId, orElse: () => {});
    return (t['total_points'] as int?) ?? 0;
  }

  String _currentWeekLabel() {
    if (_activeChallenge == null) return '';
    final start = DateTime.tryParse(_activeChallenge!['start_date'] ?? '');
    if (start == null) return '';
    final now = DateTime.now();
    final weekNum = ((now.difference(start).inDays) / 7).floor() + 1;
    final totalWeeks = (_activeChallenge!['week_duration'] as int?) ?? 0;
    return 'Week $weekNum/$totalWeeks';
  }

  double _challengeProgress() {
    if (_activeChallenge == null) return 0.0;
    final start = DateTime.tryParse(_activeChallenge!['start_date'] ?? '');
    final end = DateTime.tryParse(_activeChallenge!['end_date'] ?? '');
    if (start == null || end == null) return 0.0;
    final total = end.difference(start).inDays;
    final elapsed = DateTime.now().difference(start).inDays;
    return (elapsed / total).clamp(0.0, 1.0);
  }

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning,';
    if (hour < 17) return 'Good afternoon,';
    return 'Good evening,';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _SkeletonHome();

    final name = _profile?['name'] as String? ?? 'Member';
    final firstName = name.split(' ').first;
    final points = (_profile?['total_points'] as int?) ?? 0;
    final challengeName = _activeChallenge?['name'] as String? ?? 'No active challenge';
    final weekLabel = _currentWeekLabel();
    final progress = _challengeProgress();
    final endDateStr = _activeChallenge?['end_date'] != null
        ? _formatDate(_activeChallenge!['end_date'])
        : '';
    final todayTasks = _tasks.take(6).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF6F6F6),
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.primary,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Hero gradient card ──────────────────────────────
                  Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFFB2F0D8), Color(0xFFE8FAF2)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                    padding: EdgeInsets.only(
                      top: MediaQuery.of(context).padding.top + 16,
                      left: 20, right: 20, bottom: 20,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Greeting row + points badge
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _greeting(),
                                    style: const TextStyle(
                                      fontSize: 13,
                                      color: Color(0xFF3D6B58),
                                      fontWeight: FontWeight.w400,
                                    ),
                                  ),
                                  Row(
                                    children: [
                                      Flexible(
                                        child: Text(
                                          firstName,
                                          style: const TextStyle(
                                            fontSize: 22,
                                            fontWeight: FontWeight.w800,
                                            color: Color(0xFF1A3A2B),
                                          ),
                                          overflow: TextOverflow.ellipsis,
                                          maxLines: 1,
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      const Text('👋', style: TextStyle(fontSize: 20)),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            // Points badge
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.6),
                                borderRadius: BorderRadius.circular(24),
                                border: Border.all(color: AppColors.primaryMint),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Text('🥦', style: TextStyle(fontSize: 15)),
                                  const SizedBox(width: 5),
                                  Text(
                                    '$points',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 16,
                                      color: Color(0xFF065F46),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        // Challenge row
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.55),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Column(
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      challengeName,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 13,
                                        color: Color(0xFF1A3A2B),
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  if (weekLabel.isNotEmpty)
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: AppColors.primary.withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                      child: Text(
                                        weekLabel,
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.primary,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: LinearProgressIndicator(
                                  value: progress,
                                  minHeight: 6,
                                  backgroundColor: AppColors.primaryMint,
                                  color: AppColors.primary,
                                ),
                              ),
                              if (endDateStr.isNotEmpty)
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: Text(
                                      endDateStr,
                                      style: const TextStyle(fontSize: 10, color: Color(0xFF3D6B58)),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  // ── 3 Stat Tiles ────────────────────────────────────
                  Container(
                    color: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        _StatTile(
                          icon: '🏆',
                          value: _teamRank > 0 ? '${_ordinal(_teamRank)}' : '--',
                          label: 'Team Rank',
                        ),
                        _VertDivider(),
                        _StatTile(
                          icon: '🎯',
                          value: '$_todayDonePct%',
                          label: 'Today Done',
                        ),
                        _VertDivider(),
                        _StatTile(
                          icon: '🥦',
                          value: '$_teamPoints',
                          label: 'Team 🥦',
                          valueStyle: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF065F46),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 10),

                  // ── Today's Challenges ───────────────────────────────
                  Container(
                    color: Colors.white,
                    child: Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                "Today's Challenges",
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
                              ),
                              GestureDetector(
                                onTap: () => context.go('/tasks'),
                                child: const Row(
                                  children: [
                                    Text('All', style: TextStyle(fontSize: 13, color: AppColors.primary, fontWeight: FontWeight.w600)),
                                    Icon(Icons.chevron_right, size: 16, color: AppColors.primary),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (todayTasks.isEmpty)
                          const Padding(
                            padding: EdgeInsets.fromLTRB(18, 0, 18, 16),
                            child: Text('🎉  No active challenges right now', style: TextStyle(color: AppColors.textHint)),
                          )
                        else
                          ...todayTasks.asMap().entries.map((entry) {
                            final task = entry.value;
                            final status = _submissionStatus(task['id']);
                            final isLast = entry.key == todayTasks.length - 1;
                            return _ChallengeRow(task: task, status: status, isLast: isLast);
                          }),
                        const SizedBox(height: 6),
                      ],
                    ),
                  ),

                  const SizedBox(height: 10),

                  // ── Team Leaderboard ─────────────────────────────────
                  Container(
                    color: Colors.white,
                    child: Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'Leaderboard',
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
                              ),
                              GestureDetector(
                                onTap: () => context.go('/leaderboard'),
                                child: const Row(
                                  children: [
                                    Text('Full', style: TextStyle(fontSize: 13, color: AppColors.primary, fontWeight: FontWeight.w600)),
                                    Icon(Icons.chevron_right, size: 16, color: AppColors.primary),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (_teamLeaderboard.isEmpty)
                          const Padding(
                            padding: EdgeInsets.fromLTRB(18, 0, 18, 16),
                            child: Text('No leaderboard data yet', style: TextStyle(color: AppColors.textHint)),
                          )
                        else
                          ..._teamLeaderboard.asMap().entries.map((entry) {
                            final i = entry.key;
                            final team = entry.value;
                            final isMyTeam = team['team_id'] == _teamId;
                            final isLast = i == _teamLeaderboard.length - 1;
                            return _LeaderboardRow(
                              rank: i + 1,
                              emoji: team['emoji'] as String? ?? '🏃',
                              name: team['name'] as String? ?? 'Team',
                              points: (team['total_points'] as int?) ?? 0,
                              isHighlighted: isMyTeam,
                              isLast: isLast,
                            );
                          }),
                        const SizedBox(height: 6),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${months[d.month - 1]} ${d.day}, ${d.year}';
    } catch (_) {
      return iso;
    }
  }

  String _ordinal(int n) {
    if (n == 1) return '1st';
    if (n == 2) return '2nd';
    if (n == 3) return '3rd';
    return '${n}th';
  }
}

// ── Reusable widgets ────────────────────────────────────────────────────────

class _VertDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(width: 1, height: 60, color: const Color(0xFFEEEEEE));
}

class _StatTile extends StatelessWidget {
  final String icon;
  final String value;
  final String label;
  final TextStyle? valueStyle;
  const _StatTile({required this.icon, required this.value, required this.label, this.valueStyle});

  @override
  Widget build(BuildContext context) => Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(icon, style: const TextStyle(fontSize: 22)),
              const SizedBox(height: 4),
              Text(
                value,
                style: valueStyle ?? const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
              ),
              Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
            ],
          ),
        ),
      );
}

class _ChallengeRow extends StatelessWidget {
  final Map<String, dynamic> task;
  final String status;
  final bool isLast;
  const _ChallengeRow({required this.task, required this.status, required this.isLast});

  @override
  Widget build(BuildContext context) => Column(
        children: [
          InkWell(
            onTap: () => context.push('/tasks/submit', extra: task),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
              child: Row(
                children: [
                  Text(task['icon'] as String? ?? '📋', style: const TextStyle(fontSize: 22)),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          task['title'] as String? ?? '',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: AppColors.textPrimary),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Since week ${task['week_number'] ?? 1}',
                          style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  // Points pill
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: status == 'approved' ? AppColors.primarySurface : const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: status == 'approved' ? AppColors.primaryMint : Colors.transparent),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text('🥦', style: TextStyle(fontSize: 12)),
                        const SizedBox(width: 3),
                        Text(
                          '${task['points']}',
                          style: TextStyle(
                            color: status == 'approved' ? AppColors.primary : AppColors.textSecondary,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (!isLast) const Divider(height: 1, color: Color(0xFFF1F5F9), indent: 18),
        ],
      );
}

class _LeaderboardRow extends StatelessWidget {
  final int rank;
  final String emoji;
  final String name;
  final int points;
  final bool isHighlighted;
  final bool isLast;
  const _LeaderboardRow({
    required this.rank,
    required this.emoji,
    required this.name,
    required this.points,
    required this.isHighlighted,
    required this.isLast,
  });

  Color get _rankBg {
    if (rank == 1) return AppColors.gold;
    if (rank == 2) return AppColors.silver;
    if (rank == 3) return AppColors.bronze;
    return AppColors.textHint;
  }

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Container(
            color: isHighlighted ? AppColors.primarySurface : Colors.transparent,
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
            child: Row(
              children: [
                // Rank circle
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(color: _rankBg, shape: BoxShape.circle),
                  child: Center(
                    child: Text(
                      '$rank',
                      style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Text(emoji, style: const TextStyle(fontSize: 22)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    name,
                    style: TextStyle(
                      fontWeight: isHighlighted ? FontWeight.w700 : FontWeight.w600,
                      fontSize: 14,
                      color: isHighlighted ? AppColors.primary : AppColors.textPrimary,
                    ),
                  ),
                ),
                // Points pill
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.primarySurface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.primaryMint),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('🥦', style: TextStyle(fontSize: 12)),
                      const SizedBox(width: 3),
                      Text(
                        '$points',
                        style: const TextStyle(color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (!isLast) const Divider(height: 1, color: Color(0xFFF1F5F9), indent: 18),
        ],
      );
}

// ── Skeleton Loader ─────────────────────────────────────────────────────────

class _SkeletonHome extends StatefulWidget {
  const _SkeletonHome();
  @override
  State<_SkeletonHome> createState() => _SkeletonHomeState();
}

class _SkeletonHomeState extends State<_SkeletonHome> with SingleTickerProviderStateMixin {
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

  Widget _box({double h = 16, double? w, double r = 10}) => AnimatedBuilder(
    animation: _anim,
    builder: (_, __) => Container(
      height: h,
      width: w,
      decoration: BoxDecoration(
        color: Colors.grey.withValues(alpha: _anim.value * 0.25),
        borderRadius: BorderRadius.circular(r),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xFFF6F6F6),
    body: SafeArea(
      child: Column(
        children: [
          // hero skeleton
          AnimatedBuilder(
            animation: _anim,
            builder: (_, __) => Container(
              height: 160,
              color: Colors.green.withValues(alpha: _anim.value * 0.12),
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _box(h: 12, w: 100),
                  const SizedBox(height: 8),
                  _box(h: 22, w: 160),
                  const Spacer(),
                  _box(h: 50, r: 12),
                ],
              ),
            ),
          ),
          // stat tiles skeleton
          Container(
            color: Colors.white,
            height: 80,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                Expanded(child: Center(child: _box(h: 14, w: 60))),
                Container(width: 1, height: 60, color: Colors.grey.shade200),
                Expanded(child: Center(child: _box(h: 14, w: 60))),
                Container(width: 1, height: 60, color: Colors.grey.shade200),
                Expanded(child: Center(child: _box(h: 14, w: 60))),
              ],
            ),
          ),
          const SizedBox(height: 10),
          // tasks skeleton
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _box(h: 14, w: 140),
                const SizedBox(height: 14),
                ...List.generate(3, (_) => Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Row(
                    children: [_box(h: 22, w: 22, r: 6), const SizedBox(width: 12), Expanded(child: _box(h: 14)), const SizedBox(width: 12), _box(h: 28, w: 60, r: 20)],
                  ),
                )),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
