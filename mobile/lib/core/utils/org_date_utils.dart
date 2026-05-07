import 'package:timezone/timezone.dart' as tz;

/// Returns today's date as 'YYYY-MM-DD' in the org's IANA timezone.
/// Falls back to device local time if the timezone is unknown.
String orgTodayStr(String? ianaTimezone) {
  try {
    final location = tz.getLocation(ianaTimezone ?? 'UTC');
    final now = tz.TZDateTime.now(location);
    return '${now.year.toString().padLeft(4, '0')}-'
        '${now.month.toString().padLeft(2, '0')}-'
        '${now.day.toString().padLeft(2, '0')}';
  } catch (_) {
    return DateTime.now().toLocal().toString().split(' ')[0];
  }
}

/// Returns how long until midnight in the org's IANA timezone.
/// Falls back to device local midnight if the timezone is unknown.
Duration untilOrgMidnight(String? ianaTimezone) {
  try {
    final location = tz.getLocation(ianaTimezone ?? 'UTC');
    final now = tz.TZDateTime.now(location);
    final midnight = tz.TZDateTime(location, now.year, now.month, now.day + 1);
    return midnight.difference(now);
  } catch (_) {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day + 1).difference(now);
  }
}
