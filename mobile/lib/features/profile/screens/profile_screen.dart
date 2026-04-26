import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/services/auth_service.dart';
import '../../../core/utils/session_mixin.dart';
import '../../../core/widgets/user_avatar.dart';
import '../../../core/theme/theme_colors.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen>
    with SessionAwareMixin, SingleTickerProviderStateMixin {
  bool _loading = true;
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _team;
  List<Map<String, dynamic>> _history = [];
  int _points = 0;

  late AnimationController _pointsController;

  @override
  void initState() {
    super.initState();
    _pointsController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
    waitForSession(then: _load);
  }

  @override
  void dispose() {
    _pointsController.dispose();
    super.dispose();
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
          _points = profile['total_points'] as int? ?? 0;
          _loading = false;
        });
        // Start after the frame so _OdometerNumber is built before the controller ticks
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _pointsController.forward(from: 0);
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

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final name = _profile?['name'] as String? ?? 'Member';
    final email = _profile?['email'] as String? ?? '';
    final avatarColor = _profile?['avatar_color'] as String?;
    final avatarUrl = _profile?['avatar_url'] as String?;
    final orgName = (_profile?['organizations'] as Map?)?['name'] as String? ?? '';
    final teamName = (_team?['teams'] as Map?)?['name'] as String? ?? 'No Team';
    final teamEmoji = (_team?['teams'] as Map?)?['emoji'] as String? ?? '🏃';
    final role = _team?['role'] as String? ?? 'member';

    return Scaffold(
      appBar: AppBar(
        title: Text('Profile', style: GoogleFonts.instrumentSerif(fontSize: 36)),
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
              padding: const EdgeInsets.fromLTRB(20, 28, 20, 22),
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: context.borderColor),
              ),
              child: Column(
                children: [
                  // Avatar with gradient ring
                  Container(
                    padding: const EdgeInsets.all(3),
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        colors: [Color(0xFF22C55E), Color(0xFF166534)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: context.surfaceColor,
                      ),
                      child: UserAvatar(
                        name: name,
                        avatarColor: avatarColor,
                        avatarUrl: avatarUrl,
                        radius: 40,
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(name,
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: context.textPrimary)),
                  const SizedBox(height: 4),
                  Text(email,
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: context.textSecondary)),

                  const SizedBox(height: 22),

                  // Points pill — odometer counter
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: isDark
                            ? [const Color(0xFF052E16), const Color(0xFF14532D)]
                            : [const Color(0xFFDCFCE7), const Color(0xFFF0FDF4)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(100),
                      border: Border.all(
                        color: isDark ? const Color(0xFF166534) : const Color(0xFF86EFAC),
                        width: 1.5,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        const Text('🥦', style: TextStyle(fontSize: 30)),
                        const SizedBox(width: 10),
                        _OdometerNumber(
                          value: _points,
                          controller: _pointsController,
                          style: TextStyle(
                            fontSize: _points < 1000 ? 42 : _points < 10000 ? 36 : 30,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primary,
                            height: 1,
                            letterSpacing: -1,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Team row
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: context.primarySurface,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Text(teamEmoji, style: const TextStyle(fontSize: 18)),
                            const SizedBox(width: 8),
                            Text(teamName,
                                style: const TextStyle(
                                    fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.primary)),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(role.toUpperCase(),
                              style: const TextStyle(
                                  color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                  ),

                  if (orgName.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.business_rounded, size: 11, color: context.textHint),
                        const SizedBox(width: 4),
                        Text(orgName,
                            style: TextStyle(
                                fontSize: 11, color: context.textHint, fontWeight: FontWeight.w500)),
                      ],
                    ),
                  ],
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

                    final submission = h['task_submissions'] as Map?;
                    final taskName = (submission?['tasks'] as Map?)?['title'] as String?;
                    final submittedAt = submission?['submitted_at'] as String?;

                    final isMissed = amount == 0 && reason.toLowerCase().startsWith('task missed');
                    final label = taskName ?? _formatReason(reason);
                    final date = _formatDate(submittedAt ?? h['created_at'] as String? ?? '');

                    final String iconEmoji;
                    final Color iconBg;
                    final isDark = Theme.of(context).brightness == Brightness.dark;
                    if (isManual) {
                      iconEmoji = '🎁';
                      iconBg = context.primaryMint;
                    } else if (isMissed) {
                      iconEmoji = '❌';
                      iconBg = isDark ? const Color(0xFF3D1515) : const Color(0xFFFEF2F2);
                    } else {
                      iconEmoji = '✅';
                      iconBg = context.primarySurface;
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
                                            color: isMissed ? context.textSecondary : context.textPrimary),
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

  String _formatReason(String reason) {
    final missedPrefix = RegExp(r'^Task missed:\s*', caseSensitive: false);
    if (missedPrefix.hasMatch(reason)) {
      final withoutPrefix = reason.replaceFirst(missedPrefix, '');
      return withoutPrefix.replaceAll(RegExp(r'\s*\(\d{4}-\d{2}-\d{2}\)\s*$'), '').trim();
    }
    return reason;
  }
}

// ── Odometer widgets ──────────────────────────────────────────────────────────

class _OdometerNumber extends StatefulWidget {
  final int value;
  final AnimationController controller;
  final TextStyle style;

  const _OdometerNumber({
    required this.value,
    required this.controller,
    required this.style,
  });

  @override
  State<_OdometerNumber> createState() => _OdometerNumberState();
}

class _OdometerNumberState extends State<_OdometerNumber> {
  late List<Animation<double>> _animations;

  @override
  void initState() {
    super.initState();
    _buildAnimations();
  }

  @override
  void didUpdateWidget(_OdometerNumber old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value || old.controller != widget.controller) {
      _buildAnimations();
    }
  }

  void _buildAnimations() {
    final digits = widget.value == 0
        ? [0]
        : widget.value.toString().split('').map(int.parse).toList();
    _animations = digits.asMap().entries.map((e) {
      final start = (e.key * 0.07).clamp(0.0, 0.4);
      final end = (start + 0.72).clamp(0.0, 1.0);
      return Tween<double>(begin: 0, end: e.value.toDouble()).animate(
        CurvedAnimation(
          parent: widget.controller,
          curve: Interval(start, end, curve: Curves.easeOut),
        ),
      );
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final fontSize = widget.style.fontSize ?? 42;
    final digitHeight = fontSize * 1.15;
    final digits = widget.value == 0
        ? [0]
        : widget.value.toString().split('').map(int.parse).toList();

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: digits.asMap().entries.map((e) {
        return _OdometerDigit(
          animation: _animations[e.key],
          digitHeight: digitHeight,
          digitWidth: fontSize * 0.62,
          style: widget.style,
        );
      }).toList(),
    );
  }
}

class _OdometerDigit extends StatelessWidget {
  final Animation<double> animation;
  final double digitHeight;
  final double digitWidth;
  final TextStyle style;

  const _OdometerDigit({
    required this.animation,
    required this.digitHeight,
    required this.digitWidth,
    required this.style,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: digitWidth,
      height: digitHeight,
      child: ClipRect(
        child: AnimatedBuilder(
          animation: animation,
          builder: (context, _) {
            return OverflowBox(
              maxHeight: digitHeight * 10,
              alignment: Alignment.topCenter,
              child: Transform.translate(
                offset: Offset(0, -animation.value * digitHeight),
                child: Column(
                  children: List.generate(10, (i) => SizedBox(
                    width: digitWidth,
                    height: digitHeight,
                    child: Center(
                      child: Text('$i', style: style.copyWith(height: 1)),
                    ),
                  )),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
