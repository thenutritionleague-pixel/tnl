import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/feed_service.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/utils/session_mixin.dart';
import '../../../core/theme/theme_colors.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key});

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen>
    with SessionAwareMixin {
  bool _loading = true;
  List<Map<String, dynamic>> _posts = [];
  String? _profileId;
  String? _orgId;
  RealtimeChannel? _channel;
  final Set<String> _reactingPostIds = {};

  static const List<String> _reactions = ['🥦', '🔥', '⭐', '❤️'];

  @override
  void initState() {
    super.initState();
    waitForSession(then: _load);
  }

  @override
  void dispose() {
    _channel?.unsubscribe();
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
      final orgId = profile['org_id'] as String;
      final posts = await FeedService.getFeedItems(orgId);
      if (mounted) {
        setState(() {
          _profileId = profile['id'];
          _orgId = orgId;
          _posts = posts;
          _loading = false;
        });
        _subscribeRealtime(orgId);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _subscribeRealtime(String orgId) {
    _channel?.unsubscribe();
    _channel = Supabase.instance.client
        .channel('feed:$orgId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'feed_items',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'org_id',
            value: orgId,
          ),
          callback: (_) => _load(),
        )
        .subscribe();
  }

  Future<void> _toggleReaction(String postId, String reaction) async {
    if (_profileId == null) return;
    // Prevent duplicate taps while request is in flight
    if (_reactingPostIds.contains('$postId:$reaction')) return;

    final postIdx = _posts.indexWhere((p) => p['id'] == postId);
    if (postIdx == -1) return;

    final reactions = List<Map<String, dynamic>>.from(
        _posts[postIdx]['feed_reactions'] as List? ?? []);
    final isRemoving = reactions.any(
        (r) => r['user_id'] == _profileId && r['reaction'] == reaction);

    // Optimistic update
    List<Map<String, dynamic>> updatedReactions;
    if (isRemoving) {
      updatedReactions = reactions
          .where((r) => !(r['user_id'] == _profileId && r['reaction'] == reaction))
          .toList();
    } else {
      updatedReactions = [...reactions, {'user_id': _profileId, 'reaction': reaction}];
    }
    final updated = {..._posts[postIdx], 'feed_reactions': updatedReactions};
    if (mounted) {
      setState(() {
        _reactingPostIds.add('$postId:$reaction');
        _posts = [..._posts]..[postIdx] = updated;
      });
    }

    try {
      if (isRemoving) {
        await FeedService.removeReaction(postId: postId, userId: _profileId!, reaction: reaction);
      } else {
        await FeedService.addReaction(postId: postId, userId: _profileId!, reaction: reaction);
      }
    } catch (_) {
      // Revert optimistic update on failure
      if (mounted) {
        setState(() => _posts = [..._posts]..[postIdx] = _posts[postIdx]
            ..[
              'feed_reactions'
            ] = reactions);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to update reaction. Try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _reactingPostIds.remove('$postId:$reaction'));
    }
  }

  Map<String, int> _reactionCounts(List reactions) {
    final Map<String, int> counts = {};
    for (final r in reactions) {
      final key = r['reaction'] as String? ?? '';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  bool _hasReacted(List reactions, String key) {
    return reactions.any((r) => r['user_id'] == _profileId && r['reaction'] == key);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Feed', style: GoogleFonts.instrumentSerif(fontSize: 36)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : RefreshIndicator(
              onRefresh: _load,
              color: AppColors.primary,
              child: _posts.isEmpty
                  ? _EmptyFeed()
                  : Builder(builder: (context) {
                      final items = _buildItems();
                      return ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                      itemCount: items.length,
                      itemBuilder: (context, i) {
                        final item = items[i];
                        if (item is _DateHeader) {
                          return Padding(
                            padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
                            child: Text(item.label,
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: context.textHint,
                                    letterSpacing: 0.5)),
                          );
                        }
                        final post = item as Map<String, dynamic>;
                        final reactions = List<Map<String, dynamic>>.from(
                            post['feed_reactions'] as List? ?? []);
                        final counts = _reactionCounts(reactions);
                        final isPinned = post['pinned'] as bool? ?? false;
                        final type = post['type'] as String? ?? '';
                        final isAuto = post['is_auto_generated'] as bool? ?? false;
                        final title = post['title'] as String? ?? '';
                        final content = post['content'] as String? ?? '';
                        final authorName = (post['profiles'] as Map?)?['name'] as String?;

                        final accentColor = _TypeChip.colorFor(type);
                        final isApproval = type == 'submission_approved';
                        final isMine = isApproval && post['author_id'] == _profileId;

                        // For old generic items, build a richer title from profiles join
                        final displayTitle = (isApproval && (title == 'Task Completed' || title.isEmpty) && authorName != null)
                            ? '$authorName completed a task'
                            : title;

                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          decoration: BoxDecoration(
                            color: isApproval && isMine
                                ? (Theme.of(context).brightness == Brightness.dark
                                    ? const Color(0xFF052E16)
                                    : const Color(0xFFF0FDF4))
                                : context.surfaceColor,
                            borderRadius: BorderRadius.circular(14),
                            border: isApproval && isMine
                                ? Border.all(color: AppColors.primary.withValues(alpha: 0.35), width: 1)
                                : null,
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(13),
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Top row: type label + mine badge + time
                                  Row(
                                    children: [
                                      if (isPinned) ...[
                                        const Icon(Icons.push_pin_rounded,
                                            size: 11, color: AppColors.primary),
                                        const SizedBox(width: 3),
                                      ],
                                      Text(
                                        _TypeChip.labelFor(type),
                                        style: TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                            color: accentColor),
                                      ),
                                      if (isMine) ...[
                                        const SizedBox(width: 6),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: AppColors.primary,
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: const Text('YOU',
                                              style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Colors.white)),
                                        ),
                                      ],
                                      const Spacer(),
                                      Text(
                                        _formatTime(post['created_at'] as String? ?? ''),
                                        style: TextStyle(fontSize: 11, color: context.textHint),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),

                                  // Title
                                  if (displayTitle.isNotEmpty)
                                    Text(
                                      displayTitle,
                                      style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w700,
                                          color: context.textPrimary),
                                    ),

                                  // Content (points line for approvals, description for others)
                                  if (content.isNotEmpty) ...[
                                    const SizedBox(height: 3),
                                    Text(
                                      content,
                                      style: TextStyle(
                                          fontSize: 12,
                                          color: isApproval ? AppColors.primary : context.textSecondary,
                                          fontWeight: isApproval ? FontWeight.w600 : FontWeight.normal,
                                          height: 1.45),
                                    ),
                                  ],

                                  // For non-auto posts, show author byline
                                  if (!isAuto && authorName != null) ...[
                                    const SizedBox(height: 4),
                                    Text(
                                      'by $authorName',
                                      style: TextStyle(
                                          fontSize: 10,
                                          color: context.textHint,
                                          fontStyle: FontStyle.italic),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    );
                    }),
            ),
    );
  }

  // Reaction emoji → DB key mapping
  String _emojiToKey(String emoji) {
    switch (emoji) {
      case '🥦': return 'broccoli';
      case '🔥': return 'fire';
      case '⭐': return 'star';
      case '❤️': return 'heart';
      default: return emoji;
    }
  }

  // Build flat list interleaved with date headers
  List<dynamic> _buildItems() {
    final result = <dynamic>[];
    String? lastLabel;
    for (final post in _posts) {
      final label = _dayLabel(post['created_at'] as String? ?? '');
      if (label != lastLabel) {
        result.add(_DateHeader(label));
        lastLabel = label;
      }
      result.add(post);
    }
    return result;
  }

  String _dayLabel(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final today = DateTime.now();
      final diff = DateTime(today.year, today.month, today.day)
          .difference(DateTime(dt.year, dt.month, dt.day))
          .inDays;
      if (diff == 0) return 'TODAY';
      if (diff == 1) return 'YESTERDAY';
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return '';
    }
  }

  String _formatTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final h = dt.hour.toString().padLeft(2, '0');
      final m = dt.minute.toString().padLeft(2, '0');
      return '$h:$m';
    } catch (_) {
      return '';
    }
  }
}

class _DateHeader {
  final String label;
  const _DateHeader(this.label);
}

class _EmptyFeed extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(
              color: context.primarySurface,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(Icons.dynamic_feed_rounded,
                color: AppColors.primary, size: 36),
          ),
          const SizedBox(height: 16),
          Text('Nothing here yet',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: context.textPrimary)),
          const SizedBox(height: 6),
          Text('Activity will appear as the challenge progresses.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: context.textHint)),
        ],
      ),
    );
  }
}

class _TypeChip extends StatelessWidget {
  final String type;
  final bool isAuto;

  const _TypeChip({required this.type, required this.isAuto});

  static Color colorFor(String type) {
    switch (type) {
      case 'announcement': return const Color(0xFF3B82F6);
      case 'achievement': return AppColors.gold;
      case 'milestone': return const Color(0xFF8B5CF6);
      case 'leaderboard_change': return const Color(0xFF059669);
      case 'reminder': return AppColors.pending;
      case 'challenge_update': return AppColors.primary;
      case 'submission_approved': return AppColors.success;
      case 'submission_rejected': return AppColors.error;
      default: return AppColors.textHint;
    }
  }

  static String labelFor(String type) {
    switch (type) {
      case 'announcement': return '📢 Announcement';
      case 'achievement': return '🏆 Achievement';
      case 'milestone': return '🌟 Milestone';
      case 'leaderboard_change': return '📈 Leaderboard';
      case 'reminder': return '⏰ Reminder';
      case 'challenge_update': return '🥦 Challenge';
      case 'submission_approved': return '✅ Approved';
      case 'submission_rejected': return '❌ Not Approved';
      default: return type;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = colorFor(type);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(labelFor(type),
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
    );
  }
}
