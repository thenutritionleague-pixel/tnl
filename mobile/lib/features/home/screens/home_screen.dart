import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/services/task_service.dart';
import '../../../core/services/leaderboard_service.dart';
import '../../../core/widgets/points_badge.dart';
import '../../../core/widgets/user_avatar.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _loading = true;
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _teamMembership;
  List<Map<String, dynamic>> _tasks = [];
  List<Map<String, dynamic>> _submissions = [];
  List<Map<String, dynamic>> _memberLeaderboard = [];

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

      final teamMembership = await ProfileService.getTeamMembership(profile['id']);
      final tasks = await TaskService.getActiveTasks(profile['org_id']);
      final submissions = await TaskService.getUserSubmissions(profile['id'], profile['org_id']);
      final leaderboard = await LeaderboardService.getMemberLeaderboard(profile['org_id']);

      if (mounted) {
        setState(() {
          _profile = profile;
          _teamMembership = teamMembership;
          _tasks = tasks;
          _submissions = submissions;
          _memberLeaderboard = leaderboard.take(5).toList();
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _submissionStatus(String taskId) {
    final match = _submissions.where((s) => s['task_id'] == taskId).toList();
    if (match.isEmpty) return 'pending';
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

    final name = _profile?['name'] as String? ?? 'Member';
    final points = _profile?['total_points'] as int? ?? 0;
    final orgLogo = (_profile?['organizations'] as Map?)?['logo'] as String? ?? '🏢';
    final orgName = (_profile?['organizations'] as Map?)?['name'] as String? ?? 'Your Org';
    final teamName = (_teamMembership?['teams'] as Map?)?['name'] as String? ?? 'No Team';
    final teamEmoji = (_teamMembership?['teams'] as Map?)?['emoji'] as String? ?? '🏃';

    // Rank in leaderboard
    final myId = _profile?['id'];
    final myRank = _memberLeaderboard.indexWhere((m) => m['id'] == myId) + 1;
    final todayTasks = _tasks.take(3).toList();

    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.primary,
        child: CustomScrollView(
          slivers: [
            // App Bar
            SliverAppBar(
              pinned: true,
              backgroundColor: AppColors.surface,
              elevation: 0,
              title: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AppColors.primarySurface,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Center(child: Text(orgLogo, style: const TextStyle(fontSize: 18))),
                  ),
                  const SizedBox(width: 10),
                  Text(orgName,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                ],
              ),
              actions: [
                GestureDetector(
                  onTap: () => context.go('/profile'),
                  child: Padding(
                    padding: const EdgeInsets.only(right: 16),
                    child: UserAvatar(
                      name: name,
                      avatarColor: _profile?['avatar_color'] as String?,
                      radius: 18,
                    ),
                  ),
                ),
              ],
            ),

            SliverPadding(
              padding: const EdgeInsets.all(20),
              sliver: SliverList(
                delegate: SliverChildListDelegate([

                  // Points card
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppColors.primary, Color(0xFF047857)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Hey, ${name.split(' ').first}! 👋',
                            style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.85),
                                fontSize: 14,
                                fontWeight: FontWeight.w500)),
                        const SizedBox(height: 12),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text('🥦', style: const TextStyle(fontSize: 36)),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('$points',
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 40,
                                          fontWeight: FontWeight.w800,
                                          height: 1)),
                                  const Text('Total Points',
                                      style: TextStyle(
                                          color: Colors.white70,
                                          fontSize: 13)),
                                ],
                              ),
                            ),
                            if (myRank > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 8),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Text(
                                  myRank == 1
                                      ? '🥇 #$myRank'
                                      : myRank == 2
                                          ? '🥈 #$myRank'
                                          : myRank == 3
                                              ? '🥉 #$myRank'
                                              : '#$myRank',
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 15),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Team card
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      children: [
                        Text(teamEmoji, style: const TextStyle(fontSize: 28)),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(teamName,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 16,
                                      color: AppColors.textPrimary)),
                              Text(_teamMembership != null ? 'Your Team' : 'Not assigned to a team',
                                  style: const TextStyle(
                                      fontSize: 13,
                                      color: AppColors.textSecondary)),
                            ],
                          ),
                        ),
                        TextButton(
                          onPressed: () => context.go('/leaderboard'),
                          child: const Text('Leaderboard',
                              style: TextStyle(color: AppColors.primary, fontSize: 13)),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Today's Tasks
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text("Today's Tasks",
                          style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textPrimary)),
                      TextButton(
                        onPressed: () => context.go('/tasks'),
                        child: const Text('See all',
                            style: TextStyle(color: AppColors.primary, fontSize: 13)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  if (todayTasks.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: const Center(
                        child: Text('No active tasks right now 🎉',
                            style: TextStyle(color: AppColors.textSecondary)),
                      ),
                    )
                  else
                    ...todayTasks.map((task) {
                      final status = _submissionStatus(task['id']);
                      return _TaskPreviewCard(task: task, status: status);
                    }),

                  const SizedBox(height: 24),

                  // Mini Leaderboard
                  const Text('Top Members',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary)),
                  const SizedBox(height: 12),

                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      children: _memberLeaderboard.asMap().entries.map((entry) {
                        final i = entry.key;
                        final m = entry.value;
                        final rankEmoji = i == 0 ? '🥇' : i == 1 ? '🥈' : i == 2 ? '🥉' : '  ';
                        final pts = m['total_points'] as int? ?? 0;
                        final isMe = m['id'] == myId;
                        return Container(
                          decoration: BoxDecoration(
                            color: isMe ? AppColors.primarySurface : null,
                            borderRadius: i == 0
                                ? const BorderRadius.only(
                                    topLeft: Radius.circular(17),
                                    topRight: Radius.circular(17))
                                : i == _memberLeaderboard.length - 1
                                    ? const BorderRadius.only(
                                        bottomLeft: Radius.circular(17),
                                        bottomRight: Radius.circular(17))
                                    : null,
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            child: Row(
                              children: [
                                SizedBox(
                                  width: 28,
                                  child: Text(rankEmoji.isEmpty ? '#${i + 1}' : rankEmoji,
                                      style: const TextStyle(fontSize: 16)),
                                ),
                                const SizedBox(width: 10),
                                UserAvatar(
                                  name: m['name'] as String? ?? '?',
                                  avatarColor: m['avatar_color'] as String?,
                                  radius: 16,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    (m['name'] as String? ?? 'Member') +
                                        (isMe ? ' (you)' : ''),
                                    style: TextStyle(
                                        fontWeight: isMe ? FontWeight.w700 : FontWeight.w500,
                                        fontSize: 14,
                                        color: AppColors.textPrimary),
                                  ),
                                ),
                                PointsBadge(points: pts, fontSize: 12),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),

                  const SizedBox(height: 32),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskPreviewCard extends StatelessWidget {
  final Map<String, dynamic> task;
  final String status;

  const _TaskPreviewCard({required this.task, required this.status});

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
      case 'approved': return 'Approved ✓';
      case 'pending': return 'Submitted';
      case 'rejected': return 'Rejected';
      default: return 'Tap to submit';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Text(task['icon'] as String? ?? '📋',
              style: const TextStyle(fontSize: 24)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(task['title'] as String? ?? '',
                    style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: AppColors.textPrimary)),
                const SizedBox(height: 2),
                Text('${task['points']} pts',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.textSecondary)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: _statusColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(_statusLabel,
                style: TextStyle(
                    color: _statusColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
