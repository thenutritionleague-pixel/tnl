import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/invite_service.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/theme/theme_notifier.dart';
import '../../../core/utils/session_mixin.dart';
import '../../../core/theme/theme_colors.dart';

class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen>
    with SessionAwareMixin {
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _team;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    waitForSession(then: _load); // Wait for token refresh before loading
  }

  Future<void> _load() async {
    final authId = Supabase.instance.client.auth.currentUser?.id;
    if (authId == null) {
      return;
    }

    try {
      final profile = await ProfileService.getProfile(authId);
      if (profile == null) {
        return;
      }
      final team = await ProfileService.getTeamMembership(profile['id']);
      if (mounted) {
        setState(() {
          _profile = profile;
          _team = team;
          _loaded = true;
        });
      }
    } catch (_) {}
  }

  bool _isCaptainOrVC() {
    final role = _team?['role'] as String? ?? '';
    return role == 'captain' || role == 'vice_captain';
  }

  void _showInviteSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _InviteSheet(
        orgId: _profile?['org_id'] as String? ?? '',
        teamId: _team?['team_id'] as String?,
        invitedBy: _profile?['id'] as String? ?? '',
        teamName: (_team?['teams'] as Map?)?['name'] as String? ?? 'your team',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('More'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Profile mini card
          _MenuItem(
            icon: '👤',
            label: 'Profile',
            onTap: () => context.push('/profile'),
          ),

          const SizedBox(height: 24),

          // Invite Member — captains and vice captains only
          // While loading, keep an invisible placeholder so layout doesn't shift
          if (!_loaded)
            Visibility(
              visible: false,
              maintainSize: true,
              maintainAnimation: true,
              maintainState: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionTitle(title: 'Team'),
                  _MenuItem(
                    icon: '➕',
                    label: 'Invite Member',
                    subtitle: 'Add someone to your team',
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            )
          else if (_isCaptainOrVC()) ...[
            _SectionTitle(title: 'Team'),
            _MenuItem(
              icon: '➕',
              label: 'Invite Member',
              subtitle: 'Add someone to your team',
              onTap: () => _showInviteSheet(context),
            ),
            const SizedBox(height: 20),
          ],

          _SectionTitle(title: 'Community'),
          _MenuItem(
            icon: '📋',
            label: 'Policies',
            onTap: () => context.push('/policies'),
          ),

          const SizedBox(height: 20),
          _SectionTitle(title: 'App'),
          _DarkModeToggle(),
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

// ─────────────────────────────────────────────────────────────────────────────
// Invite Member Bottom Sheet
// ─────────────────────────────────────────────────────────────────────────────
class _InviteSheet extends StatefulWidget {
  final String orgId;
  final String? teamId;
  final String invitedBy;
  final String teamName;

  const _InviteSheet({
    required this.orgId,
    required this.teamId,
    required this.invitedBy,
    required this.teamName,
  });

  @override
  State<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends State<_InviteSheet> {
  final _emailController = TextEditingController();
  bool _loading = false;
  String? _error;
  bool _success = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) return;

    // Basic email format check
    final emailRegex = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
    if (!emailRegex.hasMatch(email)) {
      setState(() => _error = 'Please enter a valid email address.');
      return;
    }

    setState(() { _loading = true; _error = null; });

    final err = await InviteService.inviteMember(
      email: email,
      orgId: widget.orgId,
      teamId: widget.teamId,
      invitedBy: widget.invitedBy,
    );

    if (!mounted) return;
    if (err != null) {
      setState(() { _loading = false; _error = err; });
    } else {
      setState(() { _loading = false; _success = true; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(24, 12, 24, 24 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drag handle
          Center(
            child: Container(
              width: 36, height: 4,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: context.borderColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          if (_success) ...[
            // Success state
            Center(
              child: Column(
                children: [
                  Container(
                    width: 64, height: 64,
                    decoration: BoxDecoration(
                      color: context.primarySurface,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(Icons.check_rounded, color: AppColors.primary, size: 32),
                  ),
                  const SizedBox(height: 16),
                  Text('Invite sent!',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: context.textPrimary)),
                  const SizedBox(height: 6),
                  Text(
                    '${_emailController.text.trim()} can now sign up and join ${widget.teamName}.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: context.textSecondary),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: const Text('Done', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                ],
              ),
            ),
          ] else ...[
            // Form state
            Row(
              children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    color: context.primarySurface,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.person_add_rounded, color: AppColors.primary, size: 20),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Invite Member',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: context.textPrimary)),
                    Text('Joining ${widget.teamName}',
                        style: TextStyle(fontSize: 12, color: context.textSecondary)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 24),

            Text('Email address',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: context.textSecondary)),
            const SizedBox(height: 8),
            TextField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              autofocus: true,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
              style: TextStyle(fontSize: 15, color: context.textPrimary),
              decoration: InputDecoration(
                hintText: 'member@example.com',
                hintStyle: TextStyle(color: context.textHint),
                filled: true,
                fillColor: context.bgColor,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: context.borderColor),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: context.borderColor),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
                ),
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.error_outline_rounded, size: 14, color: AppColors.error),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(_error!,
                        style: const TextStyle(fontSize: 12, color: AppColors.error)),
                  ),
                ],
              ),
            ],

            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.5),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: _loading
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Send Invite',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DarkModeToggle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: themeNotifier,
      builder: (_, mode, __) {
        final dark = mode == ThemeMode.dark;
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Theme.of(context).colorScheme.outline),
          ),
          child: ListTile(
            leading: Text(dark ? '🌙' : '☀️', style: const TextStyle(fontSize: 22)),
            title: Text(
              dark ? 'Dark Mode' : 'Light Mode',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 15,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
            trailing: Switch.adaptive(
              value: dark,
              activeThumbColor: AppColors.primary,
              activeTrackColor: AppColors.primaryMint,
              onChanged: (_) => toggleTheme(),
            ),
            onTap: toggleTheme,
          ),
        );
      },
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
          style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: context.textHint,
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
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.borderColor),
      ),
      child: ListTile(
        leading: Text(icon, style: const TextStyle(fontSize: 22)),
        title: Text(label,
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: context.textPrimary)),
        subtitle: subtitle != null
            ? Text(subtitle!,
                style: TextStyle(fontSize: 12, color: context.textSecondary))
            : null,
        trailing: Icon(
          onTap != null ? Icons.chevron_right_rounded : Icons.lock_outline_rounded,
          color: context.textHint,
          size: 20,
        ),
        onTap: onTap,
      ),
    );
  }
}
