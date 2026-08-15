/// Pagination helper to bypass Supabase's default 1000-row SELECT cap.
///
/// PostgREST caps every response at 1000 rows by default. Any query that pulls
/// a whole growing table (profiles, team_members, task_submissions, …) and then
/// iterates over it in Dart will silently truncate once the scope crosses 1000
/// rows — no error, just missing data.
///
/// National runs 1100+ members, so org-wide member queries cross that line.
///
/// REQUIRED: the query MUST end with an `.order()` on a UNIQUE column (`id`).
///
/// Paging with `.range()` only means something if the rows have a guaranteed
/// order. Without one, Postgres may return them in a different order for page 2
/// than for page 1, so the same row can land on both pages while another is
/// never returned — the right row COUNT, with duplicates and silent gaps. That
/// is worse than the truncation this helper exists to fix, because nothing
/// looks broken.
///
/// Ordering on a non-unique column (total_points, created_at, name) is NOT
/// enough: tied rows can still be reshuffled between pages. Always finish with
/// `.order('id')` as a tiebreaker, even when a real sort comes first.
///
///   final rows = await fetchAllRows(
///     (from, to) => client
///         .from('profiles')
///         .select('id, name')
///         .eq('org_id', orgId)
///         .order('total_points', ascending: false) // real sort
///         .order('id', ascending: true)            // unique tiebreaker
///         .range(from, to),
///   );
Future<List<dynamic>> fetchAllRows(
  Future<dynamic> Function(int from, int to) buildQuery, {
  int pageSize = 1000,
}) async {
  final all = <dynamic>[];
  var from = 0;
  // Hard ceiling so an API or logic bug can't spin forever.
  for (var page = 0; page < 200; page++) {
    final data = await buildQuery(from, from + pageSize - 1) as List;
    if (data.isEmpty) break;
    all.addAll(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
