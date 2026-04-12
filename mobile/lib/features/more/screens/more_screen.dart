import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/widgets/user_avatar.dart';

class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _team;

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
      final team = await ProfileService.getTeamMembership(profile['id']);
      if (mounted) {
        setState(() {
          _profile = profile;
          _team = team;
        });
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final name = _profile?['name'] as String? ?? '';
    final email = _profile?['email'] as String? ?? '';
    final avatarColor = _profile?['avatar_color'] as String?;
    final teamId = (_team?['teams'] as Map?)?['id'] as String? ?? '';
    final teamName = (_team?['teams'] as Map?)?['name'] as String? ?? 'Team';
    final teamEmoji = (_team?['teams'] as Map?)?['emoji'] as String? ?? '🏃';

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('More'),
        backgroundColor: AppColors.surface,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Profile mini card
          if (_profile != null)
            GestureDetector(
              onTap: () => context.go('/profile'),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    UserAvatar(name: name, avatarColor: avatarColor, radius: 26),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name,
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.textPrimary)),
                          Text(email,
                              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded, color: AppColors.textHint),
                  ],
                ),
              ),
            ),

          const SizedBox(height: 24),

          _SectionTitle(title: 'Community'),
          _MenuItem(
            icon: '💬',
            label: 'Team Chat',
            subtitle: '$teamEmoji $teamName',
            onTap: teamId.isNotEmpty
                ? () => context.go('/chat', extra: {'teamId': teamId, 'teamName': teamName})
                : null,
          ),
          _MenuItem(
            icon: '📅',
            label: 'Events',
            onTap: () => context.go('/events'),
          ),
          _MenuItem(
            icon: '📋',
            label: 'Policies',
            onTap: () => context.go('/policies'),
          ),

          const SizedBox(height: 20),
          _SectionTitle(title: 'App'),
          _MenuItem(
            icon: 'ℹ️',
            label: 'About',
            onTap: () => context.go('/about'),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  const _SectionTitle({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(title.toUpperCase(),
          style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.textHint,
              letterSpacing: 0.8)),
    );
  }
}

class _MenuItem extends StatelessWidget {
  final String icon;
  final String label;
  final String? subtitle;
  final VoidCallback? onTap;

  const _MenuItem({required this.icon, required this.label, this.subtitle, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: ListTile(
        leading: Text(icon, style: const TextStyle(fontSize: 22)),
        title: Text(label,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: AppColors.textPrimary)),
        subtitle: subtitle != null
            ? Text(subtitle!,
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))
            : null,
        trailing: Icon(
          onTap != null ? Icons.chevron_right_rounded : Icons.lock_outline_rounded,
          color: AppColors.textHint,
          size: 20,
        ),
        onTap: onTap,
      ),
    );
  }
}
