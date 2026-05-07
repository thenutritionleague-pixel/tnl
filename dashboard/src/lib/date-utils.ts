/** Returns today's date as YYYY-MM-DD in the given IANA timezone. */
export function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}
