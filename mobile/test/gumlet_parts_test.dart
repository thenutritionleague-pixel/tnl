import 'package:flutter_test/flutter_test.dart';
import 'package:yi_nutrition_league/core/services/gumlet_video_service.dart';

void main() {
  const mb8 = 8 * 1024 * 1024;

  test('part count matches the server formula ceil(total / partSize)', () {
    for (final total in [1, mb8 - 1, mb8, mb8 + 1, 90681002, 250 * 1024 * 1024]) {
      final expected = (total + mb8 - 1) ~/ mb8;
      expect(planParts(total, mb8).length, expected, reason: 'total=$total');
    }
  });

  test('parts are contiguous, 1-based, and cover every byte exactly once', () {
    const total = 90681002; // the 60 s test clip used against Gumlet
    final parts = planParts(total, mb8);
    expect(parts.first.number, 1);
    expect(parts.first.start, 0);
    for (int i = 1; i < parts.length; i++) {
      expect(parts[i].number, parts[i - 1].number + 1);
      expect(parts[i].start, parts[i - 1].end);
    }
    expect(parts.last.end, total);
  });

  test('every part but the last is full size (S3 rejects parts under 5 MB)', () {
    final parts = planParts(90681002, mb8);
    for (final p in parts.take(parts.length - 1)) {
      expect(p.length, mb8);
    }
    expect(parts.last.length, greaterThan(0));
  });

  test('a small file is a single part', () {
    final parts = planParts(1234, mb8);
    expect(parts.length, 1);
    expect(parts.single.length, 1234);
  });

  test('empty input yields no parts', () {
    expect(planParts(0, mb8), isEmpty);
  });
}
