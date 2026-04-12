import 'package:flutter/material.dart';
import '../constants/app_colors.dart';

/// Colored circle avatar showing user initials.
class UserAvatar extends StatelessWidget {
  final String name;
  final String? avatarColor;
  final double radius;

  const UserAvatar({
    super.key,
    required this.name,
    this.avatarColor,
    this.radius = 20,
  });

  String get initials {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  Color get bgColor {
    if (avatarColor != null) {
      try {
        final hex = avatarColor!.replaceFirst('#', '');
        return Color(int.parse('FF$hex', radix: 16));
      } catch (_) {}
    }
    return AppColors.primary;
  }

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: radius,
      backgroundColor: bgColor.withValues(alpha: 0.15),
      child: Text(
        initials,
        style: TextStyle(
          fontSize: radius * 0.7,
          fontWeight: FontWeight.w700,
          color: bgColor,
        ),
      ),
    );
  }
}
