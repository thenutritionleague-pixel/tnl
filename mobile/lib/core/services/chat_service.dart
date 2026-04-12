import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';

class ChatService {
  static final _client = Supabase.instance.client;
  static RealtimeChannel? _channel;

  /// Get recent messages for a team (last 100).
  static Future<List<Map<String, dynamic>>> getMessages(String teamId) async {
    final data = await _client
        .from('messages')
        .select('''
          id, content, media_url, media_type, created_at,
          profiles!messages_user_id_fkey(id, name, avatar_color)
        ''')
        .eq('team_id', teamId)
        .order('created_at', ascending: true)
        .limit(100);

    return List<Map<String, dynamic>>.from(data);
  }

  /// Subscribe to new messages in realtime.
  static void subscribeMessages(
    String teamId,
    void Function(Map<String, dynamic> message) onMessage,
  ) {
    _channel = _client
        .channel('messages:$teamId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'messages',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'team_id',
            value: teamId,
          ),
          callback: (payload) {
            onMessage(payload.newRecord);
          },
        )
        .subscribe();
  }

  /// Send a text message.
  static Future<void> sendMessage({
    required String teamId,
    required String userId,
    required String content,
  }) async {
    await _client.from('messages').insert({
      'team_id': teamId,
      'user_id': userId,
      'content': content.trim(),
    });
  }

  /// Unsubscribe from realtime messages.
  static Future<void> unsubscribe() async {
    if (_channel != null) {
      await _client.removeChannel(_channel!);
      _channel = null;
    }
  }
}
