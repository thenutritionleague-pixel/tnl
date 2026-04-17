import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/policy_service.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/theme/theme_colors.dart';

class PoliciesScreen extends StatefulWidget {
  const PoliciesScreen({super.key});

  @override
  State<PoliciesScreen> createState() => _PoliciesScreenState();
}

class _PoliciesScreenState extends State<PoliciesScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _policies = [];

  static const List<_PolicyStyle> _styles = [
    _PolicyStyle(icon: Icons.shield_outlined,       bg: Color(0xFFEFF6FF), iconColor: Color(0xFF3B82F6)),
    _PolicyStyle(icon: Icons.emoji_events_outlined,  bg: Color(0xFFF5F3FF), iconColor: Color(0xFF8B5CF6)),
    _PolicyStyle(icon: Icons.eco_outlined,           bg: Color(0xFFECFDF5), iconColor: Color(0xFF059669)),
    _PolicyStyle(icon: Icons.star_outline_rounded,   bg: Color(0xFFFFFBEB), iconColor: Color(0xFFF59E0B)),
    _PolicyStyle(icon: Icons.gavel_outlined,         bg: Color(0xFFFEF2F2), iconColor: Color(0xFFEF4444)),
    _PolicyStyle(icon: Icons.favorite_outline,       bg: Color(0xFFFDF2F8), iconColor: Color(0xFFEC4899)),
    _PolicyStyle(icon: Icons.lightbulb_outline,      bg: Color(0xFFF0FDFA), iconColor: Color(0xFF14B8A6)),
    _PolicyStyle(icon: Icons.info_outline,           bg: Color(0xFFFFF7ED), iconColor: Color(0xFFF97316)),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  static String _stripHtml(String html) =>
      html.replaceAll(RegExp(r'<[^>]+>'), ' ')
          .replaceAll(RegExp(r'\s{2,}'), ' ')
          .trim();

  static String _previewText(String html) => _stripHtml(html);

  Future<void> _load() async {
    final authId = Supabase.instance.client.auth.currentUser?.id;
    if (authId == null) { if (mounted) setState(() => _loading = false); return; }
    try {
      final profile = await ProfileService.getProfile(authId);
      if (profile == null) { if (mounted) setState(() => _loading = false); return; }
      final policies = await PolicyService.getPolicies(profile['org_id']);
      if (mounted) setState(() { _policies = policies; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Policies',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _policies.isEmpty
              ? _EmptyState()
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  itemCount: _policies.length,
                  itemBuilder: (context, i) {
                    final p = _policies[i];
                    final styleIdx = (p['color_index'] as int? ?? i) % _styles.length;
                    final style = _styles[styleIdx];
                    final title = p['name'] as String? ?? '';
                    final rawContent = p['content'] as String? ?? '';
                    final previewText = _previewText(rawContent);
                    final preview = previewText.length > 72
                        ? '${previewText.substring(0, 72).trimRight()}…'
                        : previewText;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(
                        color: context.surfaceColor,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: context.borderColor),
                      ),
                      child: Material(
                        color: Colors.transparent,
                        borderRadius: BorderRadius.circular(18),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(18),
                          onTap: () => context.push('/policies/detail', extra: {
                            'title': title,
                            'content': rawContent, // raw HTML for detail renderer
                            'iconColor': style.iconColor,
                            'iconBg': style.bg,
                            'icon': style.icon,
                          }),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    color: style.bg,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Icon(style.icon, color: style.iconColor, size: 22),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(title,
                                          style: TextStyle(
                                              fontSize: 15,
                                              fontWeight: FontWeight.w700,
                                              color: context.textPrimary)),
                                      if (preview.isNotEmpty) ...[
                                        const SizedBox(height: 3),
                                        Text(preview,
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: context.textHint,
                                                height: 1.4)),
                                      ],
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Icon(Icons.arrow_forward_ios_rounded,
                                    size: 14, color: AppColors.textHint),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}

class _PolicyStyle {
  final IconData icon;
  final Color bg;
  final Color iconColor;
  const _PolicyStyle({required this.icon, required this.bg, required this.iconColor});
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: context.primarySurface,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(Icons.description_outlined,
                color: AppColors.primary, size: 36),
          ),
          const SizedBox(height: 16),
          Text('No policies yet',
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary)),
          const SizedBox(height: 6),
          Text('Your organisation hasn\'t added any policies.',
              style: TextStyle(fontSize: 13, color: context.textHint)),
        ],
      ),
    );
  }
}
