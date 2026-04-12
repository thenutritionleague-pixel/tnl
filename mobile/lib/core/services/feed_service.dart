import 'package:supabase_flutter/supabase_flutter.dart';

class FeedService {
  static final _client = Supabase.instance.client;

  /// Get feed items for an org, pinned first, then newest.
  static Future<List<Map<String, dynamic>>> getFeedItems(String orgId) async {
    final data = await _client
        .from('feed_items')
        .select('''
          id, type, title, content, pinned, is_auto_generated, created_at,
          author_id,
          feed_reactions(id, user_id, reaction)
        ''')
        .eq('org_id', orgId)
        .order('pinned', ascending: false)
        .order('created_at', ascending: false)
        .limit(50);

    return List<Map<String, dynamic>>.from(data);
  }

  /// Add a reaction to a feed post.
  static Future<void> addReaction({
    required String postId,
    required String userId,
    required String reaction,
  }) async {
    await _client.from('feed_reactions').upsert({
      'post_id': postId,
      'user_id': userId,
      'reaction': reaction,
    });
  }

  /// Remove a reaction from a feed post.
  static Future<void> removeReaction({
    required String postId,
    required String userId,
    required String reaction,
  }) async {
    await _client
        .from('feed_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId)
        .eq('reaction', reaction);
  }
}
