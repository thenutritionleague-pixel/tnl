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
//   const rows = await fetchAllRows(
//     (from, to) => client.from('task_submissions')
//       .select('user_id, points_awarded')
//       .eq('org_id', orgId)
//       .eq('status', 'approved')
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
