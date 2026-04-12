import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/leaderboard_service.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/widgets/points_badge.dart';
import '../../../core/widgets/user_avatar.dart';

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _loading = true;
  List<Map<String, dynamic>> _teams = [];
  List<Map<String, dynamic>> _members = [];
  String? _myProfileId;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final authId = Supabase.instance.client.auth.currentUser?.id;
    if (authId == null) return;

    try {
      final profile = await ProfileService.getProfile(authId);
      if (profile == null) return;

      final orgId = profile['org_id'] as String;

      // Get active challenge id
      final challengeData = await Supabase.instance.client
          .from('challenges')
          .select('id')
          .eq('org_id', orgId)
          .eq('status', 'active')
          .maybeSingle();
      final challengeId = challengeData?['id'] as String? ?? '';

      final teams = challengeId.isNotEmpty
          ? await LeaderboardService.getTeamLeaderboard(orgId, challengeId)
          : [];
      final members = await LeaderboardService.getMemberLeaderboard(orgId);

      if (mounted) {
        setState(() {
          _myProfileId = profile['id'];
          _teams = List<Map<String, dynamic>>.from(teams);
          _members = List<Map<String, dynamic>>.from(members);
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Leaderboard'),
        backgroundColor: AppColors.surface,
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textHint,
          indicatorColor: AppColors.primary,
          tabs: const [
            Tab(text: '🏆 Teams'),
            Tab(text: '🏅 Members'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : RefreshIndicator(
              onRefresh: _load,
              color: AppColors.primary,
              child: TabBarView(
                controller: _tabController,
                children: [_buildTeamTab(), _buildMemberTab()],
              ),
            ),
    );
  }

  Widget _buildTeamTab() {
    if (_teams.isEmpty) {
      return const Center(
        child: Text('No team data yet.', style: TextStyle(color: AppColors.textSecondary)),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: _teams.length,
      itemBuilder: (context, i) {
        final team = _teams[i];
        final rank = i + 1;
        final pts = team['total_points'] as int? ?? 0;
        final rankEmoji = rank == 1 ? '🥇' : rank == 2 ? '🥈' : rank == 3 ? '🥉' : null;
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: rank == 1
                ? LinearGradient(
                    colors: [AppColors.gold.withValues(alpha: 0.15), AppColors.surface],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  )
                : null,
            color: rank == 1 ? null : AppColors.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: rank == 1 ? AppColors.gold.withValues(alpha: 0.5) : AppColors.border,
            ),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 36,
                child: Text(rankEmoji ?? '#$rank',
                    style: TextStyle(fontSize: rankEmoji != null ? 22 : 15,
                        fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
              ),
              const SizedBox(width: 4),
              Text(team['emoji'] as String? ?? '🏃', style: const TextStyle(fontSize: 28)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(team['name'] as String? ?? 'Team',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.textPrimary)),
              ),
              PointsBadge(points: pts),
            ],
          ),
        );
      },
    );
  }

  Widget _buildMemberTab() {
    if (_members.isEmpty) {
      return const Center(
        child: Text('No member data yet.', style: TextStyle(color: AppColors.textSecondary)),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: _members.length,
      itemBuilder: (context, i) {
        final m = _members[i];
        final rank = i + 1;
        final pts = m['total_points'] as int? ?? 0;
        final isMe = m['id'] == _myProfileId;
        final rankEmoji = rank == 1 ? '🥇' : rank == 2 ? '🥈' : rank == 3 ? '🥉' : null;
        final teamMembers = m['team_members'] as List?;
        final teamName = (teamMembers != null && teamMembers.isNotEmpty) ? ((teamMembers.first['teams'] as Map?)?['name'] as String? ?? '') : '';

        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isMe ? AppColors.primarySurface : AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isMe ? AppColors.primary.withValues(alpha: 0.4) : AppColors.border,
            ),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 32,
                child: Text(rankEmoji ?? '#$rank',
                    style: TextStyle(
                        fontSize: rankEmoji != null ? 20 : 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary)),
              ),
              const SizedBox(width: 8),
              UserAvatar(
                name: m['name'] as String? ?? '?',
                avatarColor: m['avatar_color'] as String?,
                radius: 18,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${m['name'] as String? ?? 'Member'}${isMe ? ' (you)' : ''}',
                        style: TextStyle(
                            fontWeight: isMe ? FontWeight.w700 : FontWeight.w600,
                            fontSize: 14,
                            color: AppColors.textPrimary)),
                    if (teamName.isNotEmpty)
                      Text(teamName, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ],
                ),
              ),
              PointsBadge(points: pts, fontSize: 12),
            ],
          ),
        );
      },
    );
  }
}
