import 'package:flutter/material.dart';
import '../theme/theme_colors.dart';

/// Green pill displaying a 🥦 broccoli emoji and point count.
class PointsBadge extends StatelessWidget {
  final int points;
  final double fontSize;

  const PointsBadge({super.key, required this.points, this.fontSize = 13});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: context.pointsBadgeBg,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.pointsBadgeBorder),
      ),
      child: Text(
        '🥦 $points',
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.w600,
          color: context.pointsText,
        ),
      ),
    );
  }
}
