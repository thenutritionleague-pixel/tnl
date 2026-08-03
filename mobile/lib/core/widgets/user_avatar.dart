import 'package:flutter/material.dart';
import '../constants/app_colors.dart';
import '../theme/theme_colors.dart';
import '../utils/avatar_url.dart';

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
    // Split on any run of whitespace and drop empty tokens — defends against
    // double spaces (`"Ashu  Diwan"`) which would otherwise crash on `''[0]`.
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '?';
  }

  static const _palette = [
    Color(0xFF059669), Color(0xFF3B82F6), Color(0xFF8B5CF6), Color(0xFFF59E0B),
    Color(0xFFEC4899), Color(0xFF14B8A6), Color(0xFFEF4444), Color(0xFF6366F1),
    Color(0xFFF97316), Color(0xFF06B6D4), Color(0xFFA855F7), Color(0xFF10B981),
  ];

  Color get bgColor {
    const defaultGreen = '#059669';
    if (avatarColor != null && avatarColor!.isNotEmpty &&
        avatarColor!.toLowerCase() != defaultGreen) {
      try {
        final hex = avatarColor!.replaceFirst('#', '');
        return Color(int.parse('FF$hex', radix: 16));
      } catch (_) {}
    }
    final hash = name.codeUnits.fold(0, (h, c) => h * 31 + c);
    return _palette[hash.abs() % _palette.length];
  }

  @override
  Widget build(BuildContext context) {
    final bgAlpha = context.isDarkMode ? 0.28 : 0.15;
    final textColor = context.isDarkMode
        ? bgColor.withValues(alpha: 0.95)
        : bgColor;

    if (avatarUrl != null && avatarUrl!.isNotEmpty) {
      // Server-side resize via Supabase Storage transforms — payload shrinks
      // from MB to KB. Client decodes only this tiny thumbnail.
      final px = (radius * 2 * 2).round();
      final thumbUrl = avatarThumbnailUrl(avatarUrl, size: px);
      return CircleAvatar(
        radius: radius,
        backgroundColor: bgColor.withValues(alpha: bgAlpha),
        backgroundImage: ResizeImage(
          NetworkImage(thumbUrl),
          width: px,
          height: px,
        ),
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
