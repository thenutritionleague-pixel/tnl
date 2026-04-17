import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/services/auth_service.dart';
import '../../../core/utils/session_mixin.dart';
import '../../../core/widgets/points_badge.dart';
import '../../../core/widgets/user_avatar.dart';
import '../../../core/theme/theme_colors.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen>
    with SessionAwareMixin {
  bool _loading = true;
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _team;
  List<Map<String, dynamic>> _history = [];

  @override
  void initState() {
    super.initState();
    waitForSession(then: _load); // Wait for token refresh before loading
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
      final team = await ProfileService.getTeamMembership(profile['id']);
      final history = await ProfileService.getPointsHistory(profile['id']);
      if (mounted) {
        setState(() {
          _profile = profile;
          _team = team;
          _history = history;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }


  Future<void> _signOut() async {
    await AuthService.signOut();
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: AppColors.primary)));
    }

    final name = _profile?['name'] as String? ?? 'Member';
    final email = _profile?['email'] as String? ?? '';
    final points = _profile?['total_points'] as int? ?? 0;
    final avatarColor = _profile?['avatar_color'] as String?;
    final avatarUrl = _profile?['avatar_url'] as String?;
    final orgName = (_profile?['organizations'] as Map?)?['name'] as String? ?? '';
    final teamName = (_team?['teams'] as Map?)?['name'] as String? ?? 'No Team';
    final teamEmoji = (_team?['teams'] as Map?)?['emoji'] as String? ?? '🏃';
    final role = _team?['role'] as String? ?? 'member';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
        actions: [
          if (_profile != null)
            IconButton(
              icon: const Icon(Icons.edit_outlined, color: AppColors.primary),
              tooltip: 'Edit profile',
              onPressed: () async {
                final updated = await context.push<bool>('/profile/edit', extra: _profile);
                if (updated == true) _load();
              },
            ),
          IconButton(
            icon: const Icon(Icons.logout_rounded, color: AppColors.error),
            tooltip: 'Sign out',
            onPressed: _signOut,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.primary,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            // Profile card
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: context.borderColor),
              ),
              child: Column(
                children: [
                  UserAvatar(
                    name: name,
                    avatarColor: avatarColor,
                    avatarUrl: avatarUrl,
                    radius: 36,
                  ),
                  const SizedBox(height: 16),
                  Text(name,
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: context.textPrimary)),
                  const SizedBox(height: 4),
                  Text(email, style: TextStyle(fontSize: 13, color: context.textSecondary)),
                  const SizedBox(height: 4),
                  Text(orgName, style: TextStyle(fontSize: 13, color: context.textHint)),
                  const SizedBox(height: 16),
                  PointsBadge(points: points, fontSize: 15),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: context.primarySurface,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('$teamEmoji $teamName',
                            style: const TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.primary)),
                        const SizedBox(width: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(role.toUpperCase(),
                              style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // Points history
            Text('Points History',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: context.textPrimary)),
            const SizedBox(height: 12),

            if (_history.isEmpty)
              Center(child: Text('No points yet — start submitting tasks!', style: TextStyle(color: context.textSecondary)))
            else
              Container(
                decoration: BoxDecoration(
                  color: context.surfaceColor,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: context.borderColor),
                ),
                child: Column(
                  children: _history.asMap().entries.map((entry) {
                    final i = entry.key;
                    final h = entry.value;
                    final amount = h['amount'] as int? ?? 0;
                    final reason = h['reason'] as String? ?? '';
                    final isManual = h['is_manual'] as bool? ?? false;

                    // Pull task name + submitted date from the joined submission
                    final submission = h['task_submissions'] as Map?;
                    final taskName = (submission?['tasks'] as Map?)?['title'] as String?;
                    final submittedAt = submission?['submitted_at'] as String?;

                    final isMissed = amount == 0 && reason.toLowerCase().startsWith('task missed');

                    // Label: task name if available, else cleaned reason
                    final label = taskName ?? _formatReason(reason);
                    // Date: submission date for task entries, transaction date for manual
                    final date = _formatDate(submittedAt ?? h['created_at'] as String? ?? '');

                    // Icon + colours per type
                    final String iconEmoji;
                    final Color iconBg;
                    if (isManual) {
                      iconEmoji = '🎁';
                      iconBg = AppColors.primaryMint;
                    } else if (isMissed) {
                      iconEmoji = '❌';
                      iconBg = const Color(0xFFFEF2F2);
                    } else {
                      iconEmoji = '✅';
                      iconBg = AppColors.primarySurface;
                    }

                    return Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          child: Row(
                            children: [
                              Container(
                                width: 36,
                                height: 36,
                                decoration: BoxDecoration(
                                  color: iconBg,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Center(
                                  child: Text(iconEmoji, style: const TextStyle(fontSize: 16)),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(label,
                                        style: TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            color: isMissed ? AppColors.textSecondary : AppColors.textPrimary),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis),
                                    Text(date, style: TextStyle(fontSize: 11, color: context.textHint)),
                                  ],
                                ),
                              ),
                              isMissed
                                  ? const Text('Missed',
                                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.error))
                                  : Text('+$amount 🥦',
                                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: context.pointsText)),
                            ],
                          ),
                        ),
                        if (i < _history.length - 1)
                          const Divider(height: 1, indent: 64, endIndent: 16),
                      ],
                    );
                  }).toList(),
                ),
              ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      final dayName = days[dt.weekday - 1];
      final monthName = months[dt.month - 1];
      return '$dayName, ${dt.day} $monthName ${dt.year}';
    } catch (_) {
      return '';
    }
  }

  // Strips the date suffix from "Task missed: Meal Photo (2026-04-15)" → "Meal Photo"
  // Leaves other reasons unchanged.
  String _formatReason(String reason) {
    final missedPrefix = RegExp(r'^Task missed:\s*', caseSensitive: false);
    if (missedPrefix.hasMatch(reason)) {
      // Remove prefix then strip trailing date like " (2026-04-15)"
      final withoutPrefix = reason.replaceFirst(missedPrefix, '');
      return withoutPrefix.replaceAll(RegExp(r'\s*\(\d{4}-\d{2}-\d{2}\)\s*$'), '').trim();
    }
    return reason;
  }
}
