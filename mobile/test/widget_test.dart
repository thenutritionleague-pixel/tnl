import 'package:flutter_test/flutter_test.dart';
import 'package:yi_nutrition_league/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const YiNutritionApp());
  });
}
