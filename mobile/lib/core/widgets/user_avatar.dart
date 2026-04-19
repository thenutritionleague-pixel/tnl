import 'package:flutter/material.dart';
import '../constants/app_colors.dart';
import '../theme/theme_colors.dart';

/// Avatar widget — shows a real photo if [avatarUrl] is set,
/// otherwise falls back to a colored circle with initials.
class UserAvatar extends StatelessWidget {
  final String name;
  final String? avatarColor;
  final String? avatarUrl;
  final double radius;

  const UserAvatar({
    super.key,
    required this.name,
    this.avatarColor,
    this.avatarUrl,
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
    final bgAlpha = context.isDarkMode ? 0.28 : 0.15;
    final textColor = context.isDarkMode
        ? bgColor.withValues(alpha: 0.95)
        : bgColor;

    if (avatarUrl != null && avatarUrl!.isNotEmpty) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: bgColor.withValues(alpha: bgAlpha),
        backgroundImage: NetworkImage(avatarUrl!),
        onBackgroundImageError: (_, __) {},
        child: null,
      );
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: bgColor.withValues(alpha: bgAlpha),
      child: Text(
        initials,
        style: TextStyle(
          fontSize: radius * 0.7,
          fontWeight: FontWeight.w700,
          color: textColor,
        ),
      ),
    );
  }
}
