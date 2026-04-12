import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/feed_service.dart';
import '../../../core/services/profile_service.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key});

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _posts = [];
  String? _profileId;

  static const List<String> _reactions = ['🥦', '🔥', '⭐', '❤️'];

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
      final posts = await FeedService.getFeedItems(profile['org_id']);
      if (mounted) {
        setState(() {
          _profileId = profile['id'];
          _posts = posts;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleReaction(String postId, String reaction) async {
    if (_profileId == null) return;

    final postIdx = _posts.indexWhere((p) => p['id'] == postId);
    if (postIdx == -1) return;

    final reactions = List<Map<String, dynamic>>.from(
        _posts[postIdx]['feed_reactions'] as List? ?? []);
    final existing = reactions.where(
        (r) => r['user_id'] == _profileId && r['reaction'] == reaction).toList();

    if (existing.isNotEmpty) {
      await FeedService.removeReaction(postId: postId, userId: _profileId!, reaction: reaction);
    } else {
      await FeedService.addReaction(postId: postId, userId: _profileId!, reaction: reaction);
    }
    _load();
  }

  Map<String, int> _reactionCounts(List reactions) {
    final Map<String, int> counts = {};
    for (final r in reactions) {
      final emoji = r['reaction'] as String? ?? '';
      counts[emoji] = (counts[emoji] ?? 0) + 1;
    }
    return counts;
  }

  bool _hasReacted(List reactions, String emoji) {
    return reactions.any((r) => r['user_id'] == _profileId && r['reaction'] == emoji);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Feed'),
        backgroundColor: AppColors.surface,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : RefreshIndicator(
              onRefresh: _load,
              color: AppColors.primary,
              child: _posts.isEmpty
                  ? const Center(
                      child: Text('No posts yet.', style: TextStyle(color: AppColors.textSecondary)),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(20),
                      itemCount: _posts.length,
                      itemBuilder: (context, i) {
                        final post = _posts[i];
                        final reactions = List<Map<String, dynamic>>.from(
                            post['feed_reactions'] as List? ?? []);
                        final counts = _reactionCounts(reactions);
                        final isPinned = post['pinned'] as bool? ?? false;
                        final type = post['type'] as String? ?? '';
                        final isAuto = post['is_auto_generated'] as bool? ?? false;
                        final title = post['title'] as String? ?? '';
                        final content = post['content'] as String? ?? '';

                        return Container(
                          margin: const EdgeInsets.only(bottom: 14),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: isPinned
                                  ? AppColors.primary.withValues(alpha: 0.35)
                                  : AppColors.border,
                            ),
                            boxShadow: isPinned
                                ? [BoxShadow(color: AppColors.primary.withValues(alpha: 0.08), blurRadius: 12)]
                                : null,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Header
                              Padding(
                                padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                                child: Row(
                                  children: [
                                    if (isPinned) ...[
                                      const Icon(Icons.push_pin_rounded, size: 14, color: AppColors.primary),
                                      const SizedBox(width: 4),
                                    ],
                                    _TypeChip(type: type, isAuto: isAuto),
                                    const Spacer(),
                                    Text(
                                      _formatDate(post['created_at'] as String? ?? ''),
                                      style: const TextStyle(fontSize: 11, color: AppColors.textHint),
                                    ),
                                  ],
                                ),
                              ),
                              // Content
                              Padding(
                                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (title.isNotEmpty)
                                      Text(title,
                                          style: const TextStyle(
                                              fontSize: 16,
                                              fontWeight: FontWeight.w700,
                                              color: AppColors.textPrimary)),
                                    if (content.isNotEmpty) ...[
                                      const SizedBox(height: 4),
                                      Text(content,
                                          style: const TextStyle(
                                              fontSize: 14,
                                              color: AppColors.textSecondary,
                                              height: 1.5)),
                                    ],
                                  ],
                                ),
                              ),
                              // Reactions
                              Padding(
                                padding: const EdgeInsets.fromLTRB(12, 12, 16, 14),
                                child: Row(
                                  children: _reactions.map((emoji) {
                                    final count = counts[emoji] ?? 0;
                                    final reacted = _hasReacted(reactions, emoji);
                                    return GestureDetector(
                                      onTap: () => _toggleReaction(post['id'], emoji),
                                      child: AnimatedContainer(
                                        duration: const Duration(milliseconds: 200),
                                        margin: const EdgeInsets.only(right: 8),
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                        decoration: BoxDecoration(
                                          color: reacted
                                              ? AppColors.primarySurface
                                              : AppColors.background,
                                          borderRadius: BorderRadius.circular(20),
                                          border: Border.all(
                                            color: reacted ? AppColors.primary.withValues(alpha: 0.4) : AppColors.border,
                                          ),
                                        ),
                                        child: Text(
                                          count > 0 ? '$emoji $count' : emoji,
                                          style: const TextStyle(fontSize: 14),
                                        ),
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inDays == 0) return 'Today';
      if (diff.inDays == 1) return 'Yesterday';
      return '${dt.day}/${dt.month}';
    } catch (_) {
      return '';
    }
  }
}

class _TypeChip extends StatelessWidget {
  final String type;
  final bool isAuto;

  const _TypeChip({required this.type, required this.isAuto});

  Color get _color {
    switch (type) {
      case 'announcement': return const Color(0xFF3B82F6);
      case 'achievement': return AppColors.gold;
      case 'reminder': return AppColors.pending;
      case 'challenge_update': return AppColors.primary;
      case 'submission_approved': return AppColors.success;
      default: return AppColors.textHint;
    }
  }

  String get _label {
    switch (type) {
      case 'announcement': return '📢 Announcement';
      case 'achievement': return '🏆 Achievement';
      case 'reminder': return '⏰ Reminder';
      case 'challenge_update': return '🥦 Challenge';
      case 'submission_approved': return '✅ Approved';
      default: return type;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(_label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _color)),
    );
  }
}
