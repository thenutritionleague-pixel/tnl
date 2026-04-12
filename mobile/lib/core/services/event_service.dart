import 'package:supabase_flutter/supabase_flutter.dart';

class EventService {
  static final _client = Supabase.instance.client;

  /// Get active events for an org.
  static Future<List<Map<String, dynamic>>> getEvents(String orgId) async {
    final data = await _client
        .from('events')
        .select('''
          id, title, description, type, points, location,
          start_time, end_time, is_active, status,
          event_participations(id, user_id)
        ''')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('start_time');

    return List<Map<String, dynamic>>.from(data);
  }

  /// Join an event (awards points via DB trigger if configured).
  static Future<void> joinEvent({
    required String eventId,
    required String userId,
  }) async {
    await _client.from('event_participations').upsert({
      'event_id': eventId,
      'user_id': userId,
    });
  }

  /// Check if user has already joined an event.
  static Future<bool> hasJoined({
    required String eventId,
    required String userId,
  }) async {
    final data = await _client
        .from('event_participations')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .maybeSingle();
    return data != null;
  }
}
