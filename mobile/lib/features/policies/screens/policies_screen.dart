import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/policy_service.dart';
import '../../../core/services/profile_service.dart';

class PoliciesScreen extends StatefulWidget {
  const PoliciesScreen({super.key});

  @override
  State<PoliciesScreen> createState() => _PoliciesScreenState();
}

class _PoliciesScreenState extends State<PoliciesScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _policies = [];
  final Set<int> _expanded = {};

  // Color palette matching the dashboard
  static const List<Color> _colors = [
    Color(0xFF3B82F6), Color(0xFF8B5CF6), Color(0xFF059669),
    Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFFEC4899),
    Color(0xFF14B8A6), Color(0xFFF97316),
  ];

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
      final policies = await PolicyService.getPolicies(profile['org_id']);
      if (mounted) {
        setState(() {
          _policies = policies;
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
      appBar: AppBar(title: const Text('Policies'), backgroundColor: AppColors.surface),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _policies.isEmpty
              ? const Center(
                  child: Text('No policies added yet.', style: TextStyle(color: AppColors.textSecondary)))
              : ListView.builder(
                  padding: const EdgeInsets.all(20),
                  itemCount: _policies.length,
                  itemBuilder: (context, i) {
                    final p = _policies[i];
                    final colorIdx = (p['color_index'] as int? ?? i) % _colors.length;
                    final color = _colors[colorIdx];
                    final isOpen = _expanded.contains(i);
                    final content = p['content'] as String? ?? '';

                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(16),
                        border: Border(left: BorderSide(color: color, width: 4)),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)
                        ],
                      ),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(16),
                        onTap: () => setState(() {
                          if (isOpen) _expanded.remove(i); else _expanded.add(i);
                        }),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(p['name'] as String? ?? '',
                                        style: const TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.textPrimary)),
                                  ),
                                  Icon(isOpen ? Icons.expand_less : Icons.expand_more,
                                      color: AppColors.textHint),
                                ],
                              ),
                              if (isOpen && content.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                Text(content,
                                    style: const TextStyle(
                                        fontSize: 13,
                                        color: AppColors.textSecondary,
                                        height: 1.6)),
                              ],
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
