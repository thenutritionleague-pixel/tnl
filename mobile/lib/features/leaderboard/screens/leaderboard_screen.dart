import 'dart:math';
import 'package:confetti/confetti.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/leaderboard_service.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/utils/avatar_url.dart';
import '../../../core/utils/session_mixin.dart';
import '../../../core/widgets/user_avatar.dart';
import '../../../core/theme/theme_colors.dart';

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});
  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen>
    with TickerProviderStateMixin, SessionAwareMixin {
  // ── Podium animation ──────────────────────────────────────────────────────
  late AnimationController _podiumCtrl;
  late Animation<double> _podiumAnim;

  // ── Confetti ──────────────────────────────────────────────────────────────
  late final ConfettiController _confettiCtrl =
      ConfettiController(duration: const Duration(seconds: 3));

  // ── Data ──────────────────────────────────────────────────────────────────
  bool _loading = true;
  bool _loadError = false;
  int _selectedTab = 0;
  List<Map<String, dynamic>> _teams = [];
  String? _myProfileId;
  String? _myTeamId;
  String? _orgId;

  /// All active challenges this user's team is part of. Drives the selector.
  List<Map<String, dynamic>> _challenges = [];
  String _challengeId = '';

  // ── Expansion state ───────────────────────────────────────────────────────
  String? _expandedMemberInTeam; // which member under a team is open (My Team tab)
  String? _expandedIndividualId; // which individual row is open
  String? _expandedTeamId;       // which team row is open (Teams tab)

  // ── Team weekly points cache (Teams tab) ─────────────────────────────────
  // Per team, an ordered list of { challengeId, challengeName, weeks } —
  // one entry per challenge the team participates in. Rendered as
  // grouped sections in the expanded panel.
  final Map<String, List<_ChallengeWeekly>> _teamWeeklyCache = {};

  // ── Pre-loaded team member previews (avatars in rows) ────────────────────
  Map<String, List<Map<String, dynamic>>> _teamMemberPreviews = {};

  // ── Lazy-load caches ──────────────────────────────────────────────────────
  final Map<String, List<Map<String, dynamic>>> _teamMembersCache = {};
  final Map<String, Map<int, List<Map<String, dynamic>>>> _breakdownCache = {};
  final Set<String> _loadingIds = {};

  // ── Task breakdown display state ─────────────────────────────────────────
  DateTime? _challengeStartDate;

  // ── Init ──────────────────────────────────────────────────────────────────
  @override
  void initState() {
    super.initState();
    _podiumCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _podiumAnim = CurvedAnimation(parent: _podiumCtrl, curve: Curves.easeOutBack);
    waitForSession(then: _load);
  }

  @override
  void dispose() {
    _podiumCtrl.dispose();
    _confettiCtrl.dispose();
    super.dispose();
  }

  // ── Load top-level data ───────────────────────────────────────────────────
  Future<void> _load() async {
    if (mounted) setState(() { _loading = true; _loadError = false; });
    _teamMembersCache.clear();
    _breakdownCache.clear();
    _teamWeeklyCache.clear();
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
      final orgId = profile['org_id'] as String;

      // Resolve the user's team first — we need it to filter challenges.
      final teamMembership = await ProfileService.getTeamMembership(profile['id']);
      dynamic firstIfList(dynamic val) {
        if (val == null) return null;
        if (val is List) return val.isNotEmpty ? val.first : null;
        return val;
      }
      final team = firstIfList(teamMembership?['teams']);
      final myTeamId = team?['id'] as String?;

      // Fetch every active challenge in the org along with its challenge_teams.
      // We filter in-Dart to those the user's team participates in:
      //   - challenge has no challenge_teams entries (open to all teams), OR
      //   - team_id is explicitly listed in challenge_teams.
      // Matches the same membership pattern team_points_view + get_mobile_tasks use.
      final allChallengesRaw = await Supabase.instance.client
          .from('challenges')
          .select('id, name, created_at, challenge_teams(team_id)')
          .eq('org_id', orgId)
          .eq('status', 'active')
          .order('created_at', ascending: false);

      final visibleChallenges = (allChallengesRaw as List)
          .map((c) => Map<String, dynamic>.from(c as Map))
          .where((c) {
            final cts = (c['challenge_teams'] as List?) ?? const [];
            if (cts.isEmpty) return true; // open challenge
            return cts.any((ct) => (ct as Map)['team_id'] == myTeamId);
          })
          .toList();

      // List of every challenge the user's team can see — leaderboard points
      // are SUMMED across all of them so multi-challenge orgs see a unified
      // ranking. _challengeId is kept as the "primary" challenge for the
      // weekly-breakdown panels (which are still per-challenge).
      final allVisibleIds = visibleChallenges.map((c) => c['id'] as String).toList();
      final challengeId = visibleChallenges.isNotEmpty
          ? visibleChallenges.first['id'] as String
          : '';

      final teamsFuture = allVisibleIds.isNotEmpty
          ? LeaderboardService.getTeamLeaderboard(orgId, allVisibleIds)
          : Future.value(<Map<String, dynamic>>[]);
      final previewsFuture = LeaderboardService.getTeamMemberPreviews(orgId);

      final loaded = await Future.wait([teamsFuture, previewsFuture]);
      final teams   = loaded[0] as List<Map<String, dynamic>>;
      final previews = loaded[1] as Map<String, List<Map<String, dynamic>>>;

      if (mounted) {
        setState(() {
          _myProfileId = profile['id'];
          _myTeamId = myTeamId;
          _orgId = orgId;
          _challenges = visibleChallenges;
          _challengeId = challengeId;
          _teams = teams;
          _teamMemberPreviews = previews;
          _loading = false;
        });
        _podiumCtrl.forward(from: 0).whenComplete(() {
          // Skip confetti on Flutter web — canvas particle rendering causes
          // iOS Safari WebKit OOM crashes ("A problem repeatedly occurred").
          if (mounted && !kIsWeb) _confettiCtrl.play();
        });
        // Pre-load my team's members for the "My Team" tab
        if (myTeamId != null && myTeamId.isNotEmpty) {
          _loadTeamMembers(myTeamId);
        }
      }
    } catch (e) {
      debugPrint('LEADERBOARD_LOAD_ERROR: $e');
      if (handleLoadError(e)) return;
      if (mounted) setState(() { _loading = false; _loadError = true; });
    }
  }

  /// Switch the leaderboard to a different active challenge. Clears the
  /// per-challenge caches (teams, weekly points, expanded breakdowns) and
  // ── Lazy load: team members ───────────────────────────────────────────────
  Future<void> _loadTeamMembers(String teamId) async {
    if (_teamMembersCache.containsKey(teamId) || _loadingIds.contains(teamId)) return;
    setState(() => _loadingIds.add(teamId));
    try {
      final orgId = (await ProfileService.getProfile(
              Supabase.instance.client.auth.currentUser!.id))?['org_id'] as String? ?? '';
      final members = await LeaderboardService.getTeamMembersWithPoints(
          teamId, orgId, _challengeId);
      if (mounted) {
        setState(() {
          _teamMembersCache[teamId] = members;
          _loadingIds.remove(teamId);
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingIds.remove(teamId));
    }
  }

  // ── Lazy load: weekly breakdown ───────────────────────────────────────────
  Future<void> _loadBreakdown(String userId) async {
    if (_breakdownCache.containsKey(userId) || _loadingIds.contains(userId)) return;
    setState(() => _loadingIds.add(userId));
    try {
      final (breakdown, startDate) =
          await LeaderboardService.getMemberWeeklyBreakdown(userId, _challengeId);
      if (mounted) {
        setState(() {
          _breakdownCache[userId] = breakdown;
          _challengeStartDate ??= startDate;
          _loadingIds.remove(userId);
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingIds.remove(userId));
    }
  }

  // ── Lazy load: team weekly points (one section per active challenge) ─────
  Future<void> _loadTeamWeeklyPoints(String teamId) async {
    if (_teamWeeklyCache.containsKey(teamId) || _loadingIds.contains(teamId)) return;
    if (_orgId == null || _challenges.isEmpty) return;
    setState(() => _loadingIds.add(teamId));
    try {
      // Fetch the weekly breakdown for EACH challenge in parallel so the
      // expanded panel can show a section per challenge.
      final futures = _challenges.map((c) async {
        final cid = c['id'] as String;
        final weeks = await LeaderboardService.getTeamWeeklyPoints(teamId, _orgId!, cid);
        return _ChallengeWeekly(
          challengeId: cid,
          challengeName: c['name'] as String? ?? 'Challenge',
          weeks: weeks,
        );
      });
      final sections = await Future.wait(futures);
      if (mounted) {
        setState(() {
          _teamWeeklyCache[teamId] = sections;
          _loadingIds.remove(teamId);
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingIds.remove(teamId));
    }
  }

  // ── Scaffold ──────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // ── Column: sticky header + tab bar, scrollable body ──────────────
          Column(
            children: [
              // Both header and tab bar are outside the scroll view → always sticky
              _buildHeader(),
              _buildTabBar(),
              // Scrollable content
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () async {
                    _expandedMemberInTeam = null;
                    _expandedIndividualId = null;
                    _expandedTeamId = null;
                    await _load();
                  },
                  color: AppColors.primary,
                  child: _loading
                      ? const Center(
                          child: CircularProgressIndicator(color: AppColors.primary))
                      : _loadError
                          ? Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Text('😕', style: TextStyle(fontSize: 48)),
                                  const SizedBox(height: 12),
                                  Text('Could not load leaderboard.',
                                      style: TextStyle(color: context.textSecondary, fontSize: 16)),
                                  const SizedBox(height: 16),
                                  TextButton(onPressed: _load, child: const Text('Tap to retry')),
                                ],
                              ),
                            )
                          : _selectedTab == 0
                              ? _buildTeamTab()
                              : SingleChildScrollView(
                                  physics: const AlwaysScrollableScrollPhysics(),
                                  child: _buildMemberTab(),
                                ),
                ),
              ),
            ],
          ),
          // ── Confetti overlay (skip on Flutter web — causes OOM on iOS Safari) ─
          if (!kIsWeb)
            Align(
              alignment: Alignment.topCenter,
              child: ConfettiWidget(
                confettiController: _confettiCtrl,
                blastDirectionality: BlastDirectionality.explosive,
                numberOfParticles: 22,
                gravity: 0.28,
                emissionFrequency: 0.05,
                maxBlastForce: 18,
                minBlastForce: 6,
                colors: const [
                  Color(0xFF059669), Color(0xFF34D399), Color(0xFFF59E0B),
                  Color(0xFFFBBF24), Color(0xFF6EE7B7), Color(0xFF10B981),
                ],
                createParticlePath: (size) {
                  final path = Path();
                  if (Random().nextBool()) {
                    path.addOval(Rect.fromCircle(
                        center: Offset(size.width / 2, size.height / 2),
                        radius: size.width / 2));
                  } else {
                    path.addRect(Rect.fromLTWH(0, 0, size.width, size.height));
                  }
                  return path;
                },
              ),
            ),
        ],
      ),
    );
  }

  // ── Header ────────────────────────────────────────────────────────────────
  Widget _buildHeader() {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: dark
                ? [const Color(0xFF0F2416), const Color(0xFF162E1C)]
                : [const Color(0xFFB2F0D8), const Color(0xFFE8FAF2)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        padding: EdgeInsets.only(
          top: MediaQuery.of(context).padding.top + 16,
          left: 20,
          right: 20,
          bottom: 20,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Leaderboard',
                      style: GoogleFonts.instrumentSerif(
                          fontSize: 36,
                          color: dark ? const Color(0xFFF0FDF4) : const Color(0xFF1A3A2B))),
                ],
              ),
            ),
            GestureDetector(
              onTap: () {
                setState(() => _loading = true);
                _load();
              },
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.8),
                    shape: BoxShape.circle),
                child: const Icon(Icons.refresh_rounded,
                    size: 20, color: AppColors.primary),
              ),
            ),
          ],
        ),
      );
  }

  // ── Tab bar ───────────────────────────────────────────────────────────────
  Widget _buildTabBar() => Container(
        color: Theme.of(context).scaffoldBackgroundColor,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Container(
          decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(30)),
          child: Row(
            children: [
              _TabPill(
                  label: '🏆  Teams',
                  selected: _selectedTab == 0,
                  onTap: () => setState(() => _selectedTab = 0)),
              _TabPill(
                  label: '🏅  My Team',
                  selected: _selectedTab == 1,
                  onTap: () => setState(() => _selectedTab = 1)),
            ],
          ),
        ),
      );

  // ── Teams Tab ─────────────────────────────────────────────────────────────
  Widget _buildTeamTab() {
    if (_teams.isEmpty) {
      // Scrollable so RefreshIndicator still works on empty state
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.all(40),
            child: Center(
                child: Text('No team data yet.',
                    style: TextStyle(color: context.textHint))),
          ),
        ],
      );
    }
    final ranks = _tiedRanks(_teams, 'total_points');
    final surfaceColor = Theme.of(context).colorScheme.surface;
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        if (_teams.length >= 3)
          SliverToBoxAdapter(child: _buildAnimatedPodium(_teams, isTeam: true)),
        const SliverToBoxAdapter(child: SizedBox(height: 8)),
        // Lazy team rows — only the visible ones get built. Memory stays flat
        // regardless of how many teams the org grows to.
        SliverList.builder(
          itemCount: _teams.length,
          itemBuilder: (ctx, i) => _buildTeamRow(
            index: i,
            rank: ranks[i],
            surfaceColor: surfaceColor,
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 24)),
      ],
    );
  }

  /// Dense tie-aware rank: 1,1,1,2,2,3 (not 1,1,1,4,4,6).
  static List<int> _tiedRanks(List<Map<String, dynamic>> items, String pointsKey) {
    final sortedUnique = items
        .map((o) => (o[pointsKey] as num?)?.toInt() ?? 0)
        .toSet()
        .toList()
      ..sort((a, b) => b.compareTo(a));
    return items.map((o) {
      final pts = (o[pointsKey] as num?)?.toInt() ?? 0;
      return sortedUnique.indexOf(pts) + 1;
    }).toList();
  }

  static String _rankLabel(int rank) {
    if (rank == 1) return '1st';
    if (rank == 2) return '2nd';
    if (rank == 3) return '3rd';
    return '${rank}th';
  }

  static Color _rankColor(int rank) {
    if (rank == 1) return AppColors.primary;
    if (rank == 2) return AppColors.silver;
    if (rank == 3) return AppColors.bronze;
    return const Color(0xFF9CA3AF);
  }

  /// Single team row — built lazily by SliverList.builder. Each row is
  /// wrapped in RepaintBoundary so scroll repaints only the visible row,
  /// not the whole list.
  Widget _buildTeamRow({
    required int index,
    required int rank,
    required Color surfaceColor,
  }) {
    final team = _teams[index];
    final teamId = team['team_id'] as String;
    final isMyTeam = teamId == _myTeamId;
    final pts = team['total_points'] as int? ?? 0;
    final isLast = index == _teams.length - 1;
    final isExpanded = _expandedTeamId == teamId;

    return RepaintBoundary(
      child: Container(
        color: surfaceColor,
        child: Column(
          children: [
            // ── Team row (tappable) ──────────────────────────────────
            InkWell(
              onTap: () {
                setState(() {
                  if (isExpanded) {
                    _expandedTeamId = null;
                  } else {
                    _expandedTeamId = teamId;
                    _loadTeamWeeklyPoints(teamId);
                  }
                });
              },
              child: Container(
                color: isMyTeam
                    ? (Theme.of(context).brightness == Brightness.dark
                        ? const Color(0xFF134E2A)
                        : AppColors.primarySurface)
                    : Colors.transparent,
                padding: const EdgeInsets.fromLTRB(18, 9, 18, 9),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    _RankBadge(rank: rank),
                    const SizedBox(width: 12),
                    Text(team['emoji'] as String? ?? '🏃',
                        style: const TextStyle(fontSize: 26)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  team['name'] as String? ?? 'Team',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14,
                                    color: isMyTeam
                                        ? (context.isDarkMode
                                            ? Colors.white
                                            : AppColors.primary)
                                        : context.textPrimary,
                                  ),
                                ),
                              ),
                              if (isMyTeam) ...[
                                const SizedBox(width: 6),
                                _YouBadge(label: 'Your Team'),
                              ],
                            ],
                          ),
                          const SizedBox(height: 5),
                          _TeamAvatarRow(
                            members: _teamMemberPreviews[teamId] ?? [],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    _PointsPill(pts: pts),
                    const SizedBox(width: 6),
                    AnimatedRotation(
                      turns: isExpanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 220),
                      child: Icon(Icons.keyboard_arrow_down_rounded,
                          size: 16, color: context.textHint),
                    ),
                  ],
                ),
              ),
            ),

            // ── Weekly breakdown panel ───────────────────────────────
            AnimatedSize(
              duration: const Duration(milliseconds: 260),
              curve: Curves.easeInOut,
              child: isExpanded
                  ? _buildTeamWeeklyPanel(teamId)
                  : const SizedBox.shrink(),
            ),

            if (!isLast)
              Divider(
                  height: 1,
                  color: Theme.of(context).colorScheme.outline,
                  indent: 18),
          ],
        ),
      ),
    );
  }

  Widget _buildTeamWeeklyPanel(String teamId) {
    if (_loadingIds.contains(teamId)) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
      );
    }
    final sections = _teamWeeklyCache[teamId];
    if (sections == null || sections.isEmpty) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 12),
        child: Text('No points yet.',
            style: TextStyle(color: context.textHint, fontSize: 12)),
      );
    }
    // For each challenge the team is in, render a small section: challenge
    // name as header, then week pills. When only 1 active challenge, the
    // header still shows so members know which challenge they're seeing.
    return Container(
      color: Theme.of(context).brightness == Brightness.dark
          ? const Color(0xFF0F2416)
          : const Color(0xFFF0FDF4),
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: sections.asMap().entries.map((sec) {
          final isLastSection = sec.key == sections.length - 1;
          final section = sec.value;
          final sortedWeeks = section.weeks.keys.toList()..sort();
          return Padding(
            padding: EdgeInsets.only(bottom: isLastSection ? 0 : 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Challenge name header
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.emoji_events_outlined, size: 12, color: AppColors.primary),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          section.challengeName,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: context.textPrimary,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                if (sortedWeeks.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(left: 18),
                    child: Text('No points yet.',
                        style: TextStyle(color: context.textHint, fontSize: 11)),
                  )
                else
                  ...sortedWeeks.asMap().entries.map((e) {
                    final isLastWeek = e.key == sortedWeeks.length - 1;
                    final week = e.value;
                    final pts = section.weeks[week] ?? 0;
                    return Padding(
                      padding: EdgeInsets.only(left: 18, bottom: isLastWeek ? 0 : 6),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                                color: AppColors.primary,
                                borderRadius: BorderRadius.circular(12)),
                            child: Text('Week $week',
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700)),
                          ),
                          const SizedBox(width: 10),
                          Text('🥦 $pts',
                              style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: context.isDarkMode
                                      ? Colors.white.withValues(alpha: 0.9)
                                      : context.pointsText)),
                        ],
                      ),
                    );
                  }),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildTeamMembersPanel(String teamId) {
    if (_loadingIds.contains(teamId)) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Center(
            child:
                CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
      );
    }
    final members = _teamMembersCache[teamId] ?? [];
    if (members.isEmpty) {
      return Padding(
        padding: EdgeInsets.fromLTRB(18, 8, 18, 12),
        child: Text('No members found.',
            style: TextStyle(color: context.textHint, fontSize: 12)),
      );
    }
    return Container(
      color: Theme.of(context).colorScheme.surface,
      child: Column(
        children: members.asMap().entries.map((e) {
          final member = e.value;
          final memberId = member['id'] as String;
          final isExpanded = _expandedMemberInTeam == memberId;
          final isLast = e.key == members.length - 1;

          return Column(
            children: [
              InkWell(
                onTap: () {
                  setState(() {
                    if (isExpanded) {
                      _expandedMemberInTeam = null;
                    } else {
                      _expandedMemberInTeam = memberId;
                      _loadBreakdown(memberId);
                    }
                  });
                },
                child: Padding(
                  padding: EdgeInsets.fromLTRB(18, 10, 18, isExpanded ? 0 : 10),
                  child: Row(
                    children: [
                      UserAvatar(
                        name: member['name'] as String? ?? '?',
                        avatarColor: member['avatar_color'] as String?,
                        avatarUrl: member['avatar_url'] as String?,
                        radius: 14,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              member['name'] as String? ?? 'Member',
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: context.textPrimary),
                            ),
                            if ((member['role'] as String?) == 'captain')
                              _RoleBadge(label: 'Captain', color: AppColors.gold)
                            else if ((member['role'] as String?) == 'vice_captain')
                              _RoleBadge(label: 'Vice Captain', color: AppColors.silver),
                          ],
                        ),
                      ),
                      _PointsPill(
                          pts: member['challenge_points'] as int? ?? 0,
                          small: true),
                      const SizedBox(width: 6),
                      AnimatedRotation(
                        turns: isExpanded ? 0.5 : 0,
                        duration: const Duration(milliseconds: 220),
                        child: Icon(Icons.keyboard_arrow_down_rounded,
                            size: 16, color: context.textHint),
                      ),
                    ],
                  ),
                ),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 260),
                curve: Curves.easeInOut,
                child: isExpanded
                    ? _buildWeeklyBreakdown(memberId, indent: 18)
                    : const SizedBox.shrink(),
              ),
              if (!isLast)
                Divider(
                    height: 1,
                    color: Theme.of(context).colorScheme.outline,
                    indent: 18),
            ],
          );
        }).toList(),
      ),
    );
  }

  // ── My Team Tab ───────────────────────────────────────────────────────────
  Widget _buildMemberTab() {
    if (_myTeamId == null || _myTeamId!.isEmpty) {
      return Padding(
        padding: EdgeInsets.all(40),
        child: Center(
            child: Text("You're not in a team yet.",
                style: TextStyle(color: context.textHint))),
      );
    }
    if (_loadingIds.contains(_myTeamId)) {
      return const Padding(
        padding: EdgeInsets.all(40),
        child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
      );
    }
    // Map challenge_points → total_points for podium compatibility
    final myTeamMembers = (_teamMembersCache[_myTeamId] ?? [])
        .map((m) => {...m, 'total_points': m['challenge_points'] ?? 0})
        .toList();

    if (myTeamMembers.isEmpty) {
      return Padding(
        padding: EdgeInsets.all(40),
        child: Center(
            child: Text('No members in your team yet.',
                style: TextStyle(color: context.textHint))),
      );
    }
    return Column(
      children: [
        if (myTeamMembers.isNotEmpty)
          _buildAnimatedPodium(myTeamMembers, isTeam: false),
        const SizedBox(height: 8),
        _buildMyTeamMembersList(myTeamMembers),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildMyTeamMembersList(List<Map<String, dynamic>> members) => Container(
        color: Theme.of(context).colorScheme.surface,
        child: Column(
          children: () {
            final ranks = _tiedRanks(members, 'challenge_points');
            return members.asMap().entries.map((e) {
            final rank = ranks[e.key];
            final m = e.value;
            final memberId = m['id'] as String;
            final isMe = memberId == _myProfileId;
            final isExpanded = _expandedIndividualId == memberId;
            final pts = m['challenge_points'] as int? ?? 0;
            final isLast = e.key == members.length - 1;

            return Column(
              children: [
                InkWell(
                  onTap: () {
                    setState(() {
                      if (isExpanded) {
                        _expandedIndividualId = null;
                      } else {
                        _expandedIndividualId = memberId;
                        _loadBreakdown(memberId);
                      }
                    });
                  },
                  child: Container(
                    color: isMe ? (Theme.of(context).brightness == Brightness.dark ? const Color(0xFF134E2A) : AppColors.primarySurface) : Colors.transparent,
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                    child: Row(
                      children: [
                        _RankBadge(rank: rank),
                        const SizedBox(width: 12),
                        UserAvatar(
                            name: m['name'] as String? ?? '?',
                            avatarColor: m['avatar_color'] as String?,
                            avatarUrl: m['avatar_url'] as String?,
                            radius: 18),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Row(
                            children: [
                              Flexible(
                                child: Text(
                                  m['name'] as String? ?? 'Member',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                      color: isMe
                                          ? (context.isDarkMode ? Colors.white : AppColors.primary)
                                          : context.textPrimary),
                                ),
                              ),
                              if (isMe) ...[
                                const SizedBox(width: 6),
                                _YouBadge(label: 'You'),
                              ],
                            ],
                          ),
                        ),
                        _PointsPill(pts: pts),
                        const SizedBox(width: 8),
                        AnimatedRotation(
                          turns: isExpanded ? 0.5 : 0,
                          duration: const Duration(milliseconds: 250),
                          child: Icon(Icons.keyboard_arrow_down_rounded,
                              size: 20, color: context.textHint),
                        ),
                      ],
                    ),
                  ),
                ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 270),
                  curve: Curves.easeInOut,
                  child: isExpanded
                      ? _buildWeeklyBreakdown(memberId, indent: 18)
                      : const SizedBox.shrink(),
                ),
                if (!isLast)
                  Divider(height: 1, color: Theme.of(context).colorScheme.outline, indent: 18),
              ],
            );
          }).toList();
          }(),
        ),
      );

  // ── Current week helper ───────────────────────────────────────────────────
  int _currentWeek() {
    final s = _challengeStartDate;
    if (s == null) return 1;
    final diff = DateTime.now()
        .difference(DateTime(s.year, s.month, s.day))
        .inDays;
    return max(1, (diff / 7).floor() + 1);
  }

  int _elapsedDaysInWeek(int weekNum) {
    final s = _challengeStartDate;
    if (s == null || weekNum < _currentWeek()) return 7; // past week = full 7 days
    // Current week — count only days that have elapsed so far
    final weekStart = DateTime(s.year, s.month, s.day)
        .add(Duration(days: (weekNum - 1) * 7));
    final elapsed = DateTime.now().difference(weekStart).inDays + 1;
    return elapsed.clamp(1, 7);
  }

  // ── Aggregate entries by task title ──────────────────────────────────────
  Map<String, Map<String, dynamic>> _aggregateWeekEntries(
      List<Map<String, dynamic>> entries) {
    final Map<String, Map<String, dynamic>> byTask = {};
    for (final e in entries) {
      final title = e['title'] as String? ?? '';
      final status = e['status'] as String? ?? 'approved';
      byTask.putIfAbsent(title, () => {
        'icon': e['icon'] ?? '📋',
        'approved': <Map<String, dynamic>>[],
        'missed': 0,
        'rejected': 0,
        'basePts': 0,
      });
      // Keep the highest known base points for this task
      final incoming = e['points'] as int? ?? 0;
      if (incoming > (byTask[title]!['basePts'] as int)) {
        byTask[title]!['basePts'] = incoming;
      }
      if (status == 'approved') {
        (byTask[title]!['approved'] as List<Map<String, dynamic>>).add(e);
      } else if (status == 'missed') {
        byTask[title]!['missed'] = (byTask[title]!['missed'] as int) + 1;
      } else if (status == 'rejected') {
        byTask[title]!['rejected'] = (byTask[title]!['rejected'] as int) + 1;
      }
    }
    return byTask;
  }

  // ── Aggregate row widgets (past weeks) ───────────────────────────────────
  List<Widget> _buildAggregateRows(List<Map<String, dynamic>> entries, {int elapsedDays = 7}) {
    final agg = _aggregateWeekEntries(entries);
    return agg.entries.map((e) {
      final title = e.key;
      final data = e.value;
      final approved = data['approved'] as List<Map<String, dynamic>>;
      final explicitMissed = data['missed'] as int;
      final rejected = data['rejected'] as int;
      final ptsPerDay = approved.isNotEmpty
          ? (approved.first['points'] as int? ?? 0)
          : (data['basePts'] as int? ?? 0);
      final earned =
          approved.fold<int>(0, (s, x) => s + (x['points'] as int? ?? 0));
      final implicitMissed = max(0, elapsedDays - approved.length - rejected - explicitMissed);
      final totalMissed = explicitMissed + implicitMissed;
      final totalDays = elapsedDays;
      final hasIssues = totalMissed > 0 || rejected > 0;
      final daysLabel = hasIssues
          ? '${approved.length}/$totalDays days × 🥦 $ptsPerDay'
          : '$totalDays days × 🥦 $ptsPerDay';
      final indicators = [
        if (rejected > 0) '$rejected rejected',
        if (totalMissed > 0) '$totalMissed missed',
      ].join(' · ');

      return Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(data['icon'] as String,
                style: const TextStyle(fontSize: 13)),
            const SizedBox(width: 6),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          fontSize: 12, color: context.textSecondary),
                      overflow: TextOverflow.ellipsis),
                  if (hasIssues)
                    Text(indicators,
                        style: const TextStyle(
                            fontSize: 10, color: AppColors.rejected)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(daysLabel,
                    style: TextStyle(
                        fontSize: 10, color: context.textHint)),
                Text('$earned 🥦',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: hasIssues
                            ? Colors.amber.shade400
                            : context.isDarkMode
                                ? Colors.white.withValues(alpha: 0.9)
                                : context.pointsText)),
              ],
            ),
          ],
        ),
      );
    }).toList();
  }

  // ── Weekly breakdown panel ────────────────────────────────────────────────
  Widget _buildWeeklyBreakdown(String userId, {required double indent}) {
    if (_loadingIds.contains(userId)) {
      return Padding(
        padding: EdgeInsets.fromLTRB(indent, 8, 18, 12),
        child: const Center(
            child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2)),
      );
    }
    final breakdown = _breakdownCache[userId] ?? {};
    final sortedWeeks = breakdown.keys.toList()..sort();
    if (breakdown.isEmpty) {
      return Padding(
        padding: EdgeInsets.fromLTRB(indent, 8, 18, 12),
        child: Text('No submissions yet.',
            style: TextStyle(color: context.textHint, fontSize: 12)),
      );
    }
    final currentWeek = _currentWeek();

    return Container(
      color: Theme.of(context).brightness == Brightness.dark ? const Color(0xFF0F2416) : const Color(0xFFF0FDF4),
      padding: EdgeInsets.fromLTRB(indent, 8, 18, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: sortedWeeks.asMap().entries.map((e) {
          final isLastWeek = e.key == sortedWeeks.length - 1;
          final week = e.value;
          final entries = breakdown[week]!;
          final weekTotal = entries.fold<int>(0, (sum, t) {
            final status = t['status'] as String? ?? '';
            if (status == 'missed' || status == 'rejected' || status == 'pending') return sum;
            return sum + ((t['points'] as int?) ?? 0);
          });
          final isPastWeek = week < currentWeek;

          return Padding(
            padding: EdgeInsets.only(bottom: isLastWeek ? 4 : 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Week header
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(12)),
                      child: Text('Week $week',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(width: 8),
                    Text('🥦 $weekTotal',
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: context.isDarkMode
                                ? Colors.white.withValues(alpha: 0.9)
                                : context.pointsText)),
                  ],
                ),
                ...[
                  const SizedBox(height: 6),
                  // Past weeks: aggregate summary rows
                  if (isPastWeek) ..._buildAggregateRows(entries, elapsedDays: _elapsedDaysInWeek(week)),
                  // Current week: individual daily rows
                  if (!isPastWeek)
                    ...entries.map((t) {
                      final status = t['status'] as String? ?? 'approved';
                      final pts = t['points'] as int? ?? 0;
                      final date = t['date'] as String? ?? '';
                      final icon = t['icon'] as String? ?? '📋';
                      final title = t['title'] as String? ?? '';
                      final adminHint = t['admin_hint'] as String?;

                      final (statusIcon, statusColor) = switch (status) {
                        'approved' => ('✅', AppColors.primary),
                        'rejected' => ('❌', AppColors.rejected),
                        'missed'   => ('❌', AppColors.rejected),
                        _ => ('⏳', context.textHint),
                      };

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 5),
                        child: Row(
                          children: [
                            Text(statusIcon,
                                style: const TextStyle(fontSize: 12)),
                            const SizedBox(width: 6),
                            Text(icon,
                                style: const TextStyle(fontSize: 12)),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(title,
                                      style: TextStyle(
                                          fontSize: 12,
                                          color: context.textSecondary),
                                      overflow: TextOverflow.ellipsis),
                                  if (adminHint != null)
                                    Text(adminHint,
                                        style: TextStyle(
                                            fontSize: 10,
                                            color: context.textHint,
                                            fontStyle: FontStyle.italic)),
                                ],
                              ),
                            ),
                            if (date.isNotEmpty) ...[
                              Text(date,
                                  style: TextStyle(
                                      fontSize: 10,
                                      color: context.textHint)),
                              const SizedBox(width: 6),
                            ],
                            if (status == 'approved')
                              Text('+$pts 🥦',
                                  style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: statusColor))
                            else
                              Text(
                                  status == 'rejected'
                                      ? 'Rejected'
                                      : status == 'missed'
                                          ? 'Missed'
                                          : 'Pending',
                                  style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: statusColor)),
                          ],
                        ),
                      );
                    }),
                ],
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  // ── Animated Podium ──────────────────────────────────────────────────────
  Widget _buildAnimatedPodium(List<Map<String, dynamic>> items,
      {required bool isTeam}) {
    final pointsKey = isTeam ? 'total_points' : 'challenge_points';
    // Pad to 3 with empty placeholders so podium always renders
    final padded = [
      ...items,
      if (items.length < 2) <String, dynamic>{'_empty': true},
      if (items.length < 3) <String, dynamic>{'_empty': true},
    ];
    final ranks = _tiedRanks(items, pointsKey);
    // Podium layout: left=items[1], center=items[0], right=items[2]
    final r0 = ranks[0];
    final r1 = padded.length > 1 && padded[1]['_empty'] != true ? ranks[1] : 0;
    final r2 = padded.length > 2 && padded[2]['_empty'] != true ? ranks[2] : 0;
    return AnimatedBuilder(
      animation: _podiumAnim,
      builder: (context, _) => Container(
        color: Theme.of(context).colorScheme.surface,
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: padded[1]['_empty'] == true
                  ? const SizedBox()
                  : _PodiumCard(
                      item: padded[1],
                      rank: r1,
                      animatedBase: 68 * _podiumAnim.value,
                      targetBase: 68,
                      bgColor: Theme.of(context).brightness == Brightness.dark ? const Color(0xFF1E2D3D) : const Color(0xFFEFF6FF),
                      rankColor: _rankColor(r1),
                      rankLabel: _rankLabel(r1),
                      isTeam: isTeam,
                      isHighlighted: isTeam
                          ? padded[1]['team_id'] == _myTeamId
                          : padded[1]['id'] == _myProfileId,
                      avatarColor: isTeam ? null : padded[1]['avatar_color'] as String?,
                      avatarUrl: isTeam ? null : padded[1]['avatar_url'] as String?,
                    ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _PodiumCard(
                item: padded[0],
                rank: r0,
                animatedBase: 96 * _podiumAnim.value,
                targetBase: 96,
                bgColor: Theme.of(context).brightness == Brightness.dark ? const Color(0xFF134E2A) : AppColors.primarySurface,
                rankColor: _rankColor(r0),
                rankLabel: _rankLabel(r0),
                isTeam: isTeam,
                showCrown: r0 == 1,
                isHighlighted: isTeam
                    ? padded[0]['team_id'] == _myTeamId
                    : padded[0]['id'] == _myProfileId,
                avatarColor: isTeam ? null : padded[0]['avatar_color'] as String?,
                avatarUrl: isTeam ? null : padded[0]['avatar_url'] as String?,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: padded[2]['_empty'] == true
                  ? const SizedBox()
                  : _PodiumCard(
                      item: padded[2],
                      rank: r2,
                      animatedBase: 48 * _podiumAnim.value,
                      targetBase: 48,
                      bgColor: Theme.of(context).brightness == Brightness.dark ? const Color(0xFF2D1F0E) : const Color(0xFFFFF7ED),
                      rankColor: _rankColor(r2),
                      rankLabel: _rankLabel(r2),
                      isTeam: isTeam,
                      isHighlighted: isTeam
                          ? padded[2]['team_id'] == _myTeamId
                          : padded[2]['id'] == _myProfileId,
                      avatarColor: isTeam ? null : padded[2]['avatar_color'] as String?,
                      avatarUrl: isTeam ? null : padded[2]['avatar_url'] as String?,
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Per-challenge weekly breakdown for a team ────────────────────────────────
class _ChallengeWeekly {
  final String challengeId;
  final String challengeName;
  final Map<int, int> weeks; // week_number → points
  const _ChallengeWeekly({
    required this.challengeId,
    required this.challengeName,
    required this.weeks,
  });
}

// ── Podium Card ──────────────────────────────────────────────────────────────

class _PodiumCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final int rank;
  final double animatedBase; // current animated height (0 → targetBase)
  final double targetBase;   // fixed slot height
  final Color bgColor;
  final Color rankColor;
  final String rankLabel;
  final bool isTeam;
  final bool showCrown;
  final bool isHighlighted;
  final String? avatarColor;
  final String? avatarUrl;

  const _PodiumCard({
    required this.item,
    required this.rank,
    required this.animatedBase,
    required this.targetBase,
    required this.bgColor,
    required this.rankColor,
    required this.rankLabel,
    required this.isTeam,
    this.showCrown = false,
    this.isHighlighted = false,
    this.avatarColor,
    this.avatarUrl,
  });

  @override
  Widget build(BuildContext context) {
    final pts  = item['total_points'] as int? ?? 0;
    final name = item['name'] as String? ?? '';
    final emoji = isTeam ? (item['emoji'] as String? ?? '🏃') : null;
    final barH = animatedBase.clamp(0.0, targetBase);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Crown or spacer (fixed height keeps layout stable during animation)
        SizedBox(
          height: 28,
          child: showCrown
              ? const Center(child: Text('👑', style: TextStyle(fontSize: 20)))
              : null,
        ),
        // Avatar / emoji
        if (isTeam)
          Text(emoji!, style: TextStyle(fontSize: rank == 1 ? 38 : 30))
        else
          UserAvatar(
            name: name,
            avatarColor: avatarColor,
            avatarUrl: avatarUrl,
            radius: rank == 1 ? 26 : 20,
          ),
        const SizedBox(height: 6),
        // Name
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            name,
            style: TextStyle(
              fontSize: rank == 1 ? 13 : 11,
              fontWeight: FontWeight.w700,
              color: isHighlighted ? AppColors.primary : context.textPrimary,
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(height: 3),
        // Points pill
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('🥦', style: TextStyle(fontSize: 11)),
            const SizedBox(width: 2),
            Text(
              '$pts',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: rankColor,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        // ── Podium bar slot (fixed height, never shrinks) ──────────────────
        // A Stack lets the rank ordinal float in the CENTER of the slot
        // so it is always readable — the colored bar grows behind it.
        SizedBox(
          height: targetBase,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              // Animated bar — grows from the bottom upward
              Align(
                alignment: Alignment.bottomCenter,
                child: Container(
                  width: double.infinity,
                  height: barH,
                  decoration: BoxDecoration(
                    color: bgColor,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(10),
                    ),
                    border: Border(
                      top: BorderSide(
                          color: rankColor.withValues(alpha: 0.45), width: 2),
                      left: BorderSide(
                          color: rankColor.withValues(alpha: 0.2), width: 1),
                      right: BorderSide(
                          color: rankColor.withValues(alpha: 0.2), width: 1),
                    ),
                  ),
                ),
              ),
              // Rank label — always centered in the slot (on top of bar)
              Center(
                child: Text(
                  rankLabel,
                  style: TextStyle(
                    fontSize: rank == 1 ? 22 : 17,
                    fontWeight: FontWeight.w900,
                    color: rankColor,
                    shadows: [
                      Shadow(
                        color: rankColor.withValues(alpha: 0.2),
                        blurRadius: 4,
                        offset: const Offset(0, 1),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Small reusable widgets ────────────────────────────────────────────────────

class _TabPill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _TabPill(
      {required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) => Expanded(
        child: GestureDetector(
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            margin: const EdgeInsets.all(4),
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: selected
                  ? AppColors.primary
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(26),
              boxShadow: selected
                  ? [
                      BoxShadow(
                          color: Colors.black.withValues(alpha: 0.08),
                          blurRadius: 6,
                          offset: const Offset(0, 2))
                    ]
                  : [],
            ),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : context.textSecondary,
              ),
            ),
          ),
        ),
      );
}

class _RankBadge extends StatelessWidget {
  final int rank;
  const _RankBadge({required this.rank});

  Color get _bg {
    if (rank == 1) return AppColors.gold;
    if (rank == 2) return AppColors.silver;
    if (rank == 3) return AppColors.bronze;
    return const Color(0xFF94A3B8);
  }

  @override
  Widget build(BuildContext context) => Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(color: _bg, shape: BoxShape.circle),
        child: Center(
          child: Text(
            '$rank',
            style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w800),
          ),
        ),
      );
}

class _PointsPill extends StatelessWidget {
  final int pts;
  final bool small;
  const _PointsPill({required this.pts, this.small = false});

  @override
  Widget build(BuildContext context) => Container(
        padding: EdgeInsets.symmetric(
            horizontal: small ? 7 : 10, vertical: small ? 3 : 5),
        decoration: BoxDecoration(
          color: context.pointsBadgeBg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: context.pointsBadgeBorder),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('🥦', style: TextStyle(fontSize: small ? 10 : 12)),
            const SizedBox(width: 3),
            Text(
              '$pts',
              style: TextStyle(
                  color: context.isDarkMode
                      ? Colors.white.withValues(alpha: 0.9)
                      : context.pointsText,
                  fontSize: small ? 10 : 12,
                  fontWeight: FontWeight.w700),
            ),
          ],
        ),
      );
}

class _YouBadge extends StatelessWidget {
  final String label;
  const _YouBadge({required this.label});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(10)),
        child: Text(label,
            style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w700)),
      );
}

// ── Team avatar row (overlapping circles) ────────────────────────────────────

class _TeamAvatarRow extends StatelessWidget {
  final List<Map<String, dynamic>> members;
  const _TeamAvatarRow({required this.members});

  static const int _maxShow = 6;
  static const double _radius = 11.0;
  static const double _overlap = 8.0; // how much each circle overlaps the previous

  static const _palette = [
    Color(0xFF059669), // emerald
    Color(0xFF3B82F6), // blue
    Color(0xFF8B5CF6), // violet
    Color(0xFFF59E0B), // amber
    Color(0xFFEC4899), // pink
    Color(0xFF14B8A6), // teal
    Color(0xFFEF4444), // red
    Color(0xFF6366F1), // indigo
    Color(0xFFF97316), // orange
    Color(0xFF06B6D4), // cyan
    Color(0xFFA855F7), // purple
    Color(0xFF10B981), // green
  ];

  /// Returns a color for an avatar. Uses `avatar_color` if it's not the
  /// default green, otherwise picks a consistent color from the palette
  /// based on the member's name so every user always looks the same.
  Color _solidColor(String? hex, String name) {
    const defaultGreen = '#059669';
    if (hex != null && hex.isNotEmpty && hex.toLowerCase() != defaultGreen) {
      try {
        return Color(int.parse('FF${hex.replaceFirst('#', '')}', radix: 16));
      } catch (_) {}
    }
    // Hash name → palette index for a stable, varied color
    final hash = name.codeUnits.fold(0, (h, c) => h * 31 + c);
    return _palette[hash.abs() % _palette.length];
  }

  /// First letter(s) of name as initials.
  String _initials(String name) {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  @override
  Widget build(BuildContext context) {
    if (members.isEmpty) return const SizedBox.shrink();

    final show = members.take(_maxShow).toList();
    final extra = members.length - show.length;
    final slotWidth = _radius * 2 + (show.length - 1) * (_radius * 2 - _overlap);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: _radius * 2,
          width: slotWidth,
          child: Stack(
            // Build in reverse so index-0 (first member) is on top (last in Stack = topmost)
            children: List.generate(show.length, (i) {
              final member = show[show.length - 1 - i]; // reverse order
              final pos = show.length - 1 - i;          // original left position
              final bg = _solidColor(member['avatar_color'] as String?, member['name'] as String? ?? '');
              return Positioned(
                left: pos * (_radius * 2 - _overlap),
                child: Container(
                  width: _radius * 2,
                  height: _radius * 2,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    // Ring matches scaffold bg so circles separate cleanly
                    border: Border.all(
                        color: Theme.of(context).scaffoldBackgroundColor,
                        width: 1.5),
                  ),
                  child: () {
                    final url = member['avatar_url'] as String?;
                    if (url != null && url.isNotEmpty) {
                      // Server-side thumbnail + client cache cap — tiny payload, tiny memory
                      final px = (_radius * 2 * 2).round();
                      return CircleAvatar(
                        radius: _radius,
                        backgroundColor: bg,
                        backgroundImage: ResizeImage(
                          NetworkImage(avatarThumbnailUrl(url, size: px)),
                          width: px,
                          height: px,
                        ),
                      );
                    }
                    return CircleAvatar(
                      radius: _radius,
                      backgroundColor: bg,
                      child: Text(
                        _initials(member['name'] as String? ?? '?'),
                        style: TextStyle(
                          fontSize: _radius * 0.75,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    );
                  }(),
                ),
              );
            }),
          ),
        ),
        if (extra > 0)
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(
              '+$extra',
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: context.textHint),
            ),
          ),
      ],
    );
  }
}

class _RoleBadge extends StatelessWidget {
  final String label;
  final Color color;
  const _RoleBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 2),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.5), width: 0.8),
        ),
        child: Text(
          label,
          style: TextStyle(
              color: color,
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3),
        ),
      );
}
