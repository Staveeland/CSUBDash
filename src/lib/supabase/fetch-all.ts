import 'server-only'

const PAGE_SIZE = 1000

/**
 * Fetch all rows from a Supabase table, paginating automatically to bypass
 * the default PostgREST 1000-row limit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAll(
  supabase: any,
  table: string,
  select: string
): Promise<{ data: any[]; error: { message: string } | null }> {
  const allRows: any[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: allRows, error }
    if (!data || data.length === 0) break

    allRows.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: allRows, error: null }
}
