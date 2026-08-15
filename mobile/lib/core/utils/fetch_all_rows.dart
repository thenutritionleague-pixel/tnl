/// Pagination helper to bypass Supabase's default 1000-row SELECT cap.
///
/// PostgREST caps every response at 1000 rows by default. Any query that pulls
/// a whole growing table (profiles, team_members, task_submissions, …) and then
/// iterates over it in Dart will silently truncate once the scope crosses 1000
/// rows — no error, just missing data.
///
/// National runs 1100+ members, so org-wide member queries cross that line.
///
/// IMPORTANT: the query you build MUST apply a deterministic `.order(...)`.
/// Paginating with `.range()` over an unordered query is undefined — Postgres
/// may return rows in a different order per page, which duplicates some rows
/// and drops others.
///
///   final rows = await fetchAllRows(
///     (from, to) => client
///         .from('profiles')
///         .select('id, name')
///         .eq('org_id', orgId)
///         .order('total_points', ascending: false)
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
