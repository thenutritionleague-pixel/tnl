import 'package:supabase_flutter/supabase_flutter.dart';

class PolicyService {
  static final _client = Supabase.instance.client;

  /// Get all policies for an org.
  static Future<List<Map<String, dynamic>>> getPolicies(String orgId) async {
    final data = await _client
        .from('policies')
        .select('id, name, content, color_index, updated_at')
        .eq('org_id', orgId)
        .order('created_at');

    return List<Map<String, dynamic>>.from(data);
  }
}
