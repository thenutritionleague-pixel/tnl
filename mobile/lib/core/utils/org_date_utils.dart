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

/// Returns true if the current org-local time is in the submission lockout
/// window: 12:15 AM – 3:59 AM. Grace period has ended but next day hasn't
/// opened yet. During this window task submission is disabled.
bool isInSubmissionLockout(String? ianaTimezone) {
  try {
    final location = tz.getLocation(ianaTimezone ?? 'UTC');
    final now = tz.TZDateTime.now(location);
    final h = now.hour;
    final m = now.minute;
    if (h == 0 && m >= 15) return true; // 00:15 – 00:59
    if (h >= 1 && h < 4) return true;   // 01:00 – 03:59
    return false;
  } catch (_) {
    return false;
  }
}
