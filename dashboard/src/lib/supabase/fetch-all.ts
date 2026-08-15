// Pagination helper to bypass Supabase's default 1000-row SELECT cap.
//
// Supabase / PostgREST limits each response to 1000 rows by default. Any code
// that pulls all rows from a growing table (task_submissions, points_transactions,
// feed_items, …) and then iterates/reduces in JS will silently truncate the
// result once the table crosses 1000 rows for the queried scope.
//
// Use this helper any time you need to fetch *all* matching rows. It loops
// using `.range(from, to)` until the response returns fewer than `pageSize`
// rows, then returns the concatenated list.
//
// REQUIRED: the query MUST end with a `.order()` on a UNIQUE column (`id`).
//
// Paging with `.range()` only means something if the rows have a guaranteed
// order. Without one, Postgres may return them in a different order for page 2
// than for page 1, so the same row can appear on both pages while another is
// never returned — you get the right row COUNT with duplicated and missing
// records. That is worse than the truncation this helper exists to fix,
// because nothing looks wrong.
//
// Ordering on a non-unique column (created_at, total_points, name) is NOT
// enough: rows that tie can still be reshuffled between pages. Always finish
// with `.order('id')` as a tiebreaker, even when another sort comes first.
//
//   const rows = await fetchAllRows(
//     (from, to) => client.from('task_submissions')
//       .select('user_id, points_awarded')
//       .eq('org_id', orgId)
//       .eq('status', 'approved')
//       .order('id', { ascending: true })   // ← unique tiebreaker, required
//       .range(from, to),
//   )
//
// Do NOT use this for unbounded UI lists — those should be page-by-page user
// pagination. This is for backend aggregation passes that genuinely need
// every row.

// We accept the full PostgrestBuilder shape; only `data` + `error` matter here.
// Using a permissive interface avoids fighting Supabase's complex generic types
// (which treat joined FK results as arrays even when they're one-to-many).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryResult<T> = PromiseLike<{ data: T[] | null; error: any; [k: string]: any }>

export async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: (from: number, to: number) => QueryResult<any>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  // Hard ceiling so an API or logic bug can't cause an infinite loop
  for (let page = 0; page < 200; page++) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}
