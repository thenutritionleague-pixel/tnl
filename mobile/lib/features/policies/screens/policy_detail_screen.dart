import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/theme/theme_colors.dart';

class PolicyDetailScreen extends StatelessWidget {
  final String title;
  final String content;
  final Color iconColor;
  final Color iconBg;
  final IconData icon;

  const PolicyDetailScreen({
    super.key,
    required this.title,
    required this.content,
    required this.iconColor,
    required this.iconBg,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
        title: Text(title,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Theme.of(context).brightness == Brightness.dark
                    ? Theme.of(context).colorScheme.surface
                    : iconBg,
                borderRadius: BorderRadius.circular(20),
                border: Theme.of(context).brightness == Brightness.dark
                    ? Border.all(color: Theme.of(context).colorScheme.outline)
                    : null,
              ),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: iconColor.withValues(alpha: Theme.of(context).brightness == Brightness.dark ? 0.2 : 0.15),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(icon, color: iconColor, size: 26),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Text(title,
                        style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: Theme.of(context).brightness == Brightness.dark
                                ? Theme.of(context).colorScheme.onSurface
                                : iconColor)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Content — rendered as HTML
            Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: context.borderColor),
              ),
              child: content.trim().isEmpty
                  ? Padding(
                      padding: EdgeInsets.all(20),
                      child: Text(
                        'No content available.',
                        style: TextStyle(
                            fontSize: 14,
                            color: context.textHint,
                            fontStyle: FontStyle.italic),
                      ),
                    )
                  : Html(
                      data: content,
                      style: {
                        'body': Style(
                          margin: Margins.zero,
                          padding: HtmlPaddings.all(20),
                          fontSize: FontSize(14),
                          color: context.textSecondary,
                          lineHeight: const LineHeight(1.75),
                        ),
                        'h1': Style(
                          fontSize: FontSize(22),
                          fontWeight: FontWeight.w800,
                          color: context.textPrimary,
                          margin: Margins.only(top: 8, bottom: 8),
                        ),
                        'h2': Style(
                          fontSize: FontSize(18),
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                          margin: Margins.only(top: 16, bottom: 6),
                        ),
                        'h3': Style(
                          fontSize: FontSize(15),
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                          margin: Margins.only(top: 12, bottom: 4),
                        ),
                        'p': Style(
                          margin: Margins.only(bottom: 10),
                        ),
                        'ul': Style(
                          margin: Margins.only(bottom: 10, left: 16),
                        ),
                        'ol': Style(
                          margin: Margins.only(bottom: 10, left: 16),
                        ),
                        'li': Style(
                          margin: Margins.only(bottom: 4),
                        ),
                        'strong': Style(
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                        'a': Style(
                          color: AppColors.primary,
                          textDecoration: TextDecoration.underline,
                        ),
                        'blockquote': Style(
                          border: const Border(
                            left: BorderSide(color: AppColors.primary, width: 3),
                          ),
                          padding: HtmlPaddings.only(left: 12),
                          color: context.textHint,
                          fontStyle: FontStyle.italic,
                        ),
                      },
                    ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}
