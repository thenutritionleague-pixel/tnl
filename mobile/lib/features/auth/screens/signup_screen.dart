import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/theme/theme_colors.dart';

class SignupScreen extends StatefulWidget {
  final String email;
  final String orgId;
  final String? inviteId;
  final String? teamId;

  const SignupScreen({
    super.key,
    required this.email,
    required this.orgId,
    this.inviteId,
    this.teamId,
  });

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _nameController = TextEditingController();
  bool _loading = false;
  String _error = '';

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _handleCreate() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Please enter your name.');
      return;
    }
    setState(() { _loading = true; _error = ''; });

    try {
      final authId = Supabase.instance.client.auth.currentUser?.id;
      if (authId == null) {
        setState(() { _error = 'Session expired. Please log in again.'; _loading = false; });
        return;
      }

      // Claim invite atomically using RPC
      await ProfileService.claimInvite(
        authId: authId,
        email: widget.email,
        name: name,
        orgId: widget.orgId,
        inviteId: widget.inviteId,
        teamId: widget.teamId,
      );

      if (mounted) context.go('/home');
    } catch (e) {
      setState(() {
        _error = 'Failed to create account. Please try again.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primaryMint,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 40),

              // Logo
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Center(
                        child: Text('🥦', style: TextStyle(fontSize: 24))),
                  ),
                  const SizedBox(width: 12),
                  Text('Yi Nutrition League 2.0',
                      style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                          color: context.textPrimary)),
                ],
              ),

              const SizedBox(height: 48),

              Text(
                "You're in! 🎉",
                style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary),
              ),
              const SizedBox(height: 8),
              Text(
                "Just one more step — tell us your name.",
                style: TextStyle(fontSize: 15, color: context.textSecondary),
              ),

              const SizedBox(height: 32),

              Container(
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                        color: Colors.black.withValues(alpha: 0.08),
                        blurRadius: 24,
                        offset: const Offset(0, 8)),
                  ],
                ),
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Full Name',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: context.textPrimary)),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _nameController,
                      textCapitalization: TextCapitalization.words,
                      autofocus: true,
                      decoration:
                          const InputDecoration(hintText: 'e.g. Aisha Khan'),
                    ),
                    const SizedBox(height: 12),
                    // Email (read-only hint)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        color: context.bgColor,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: context.borderColor),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.email_outlined,
                              color: context.textHint, size: 18),
                          const SizedBox(width: 10),
                          Text(widget.email,
                              style: TextStyle(
                                  fontSize: 14, color: context.textSecondary)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    if (_error.isNotEmpty) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: AppColors.error.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(_error,
                            style: const TextStyle(
                                color: AppColors.error,
                                fontSize: 13,
                                fontWeight: FontWeight.w500)),
                      ),
                      const SizedBox(height: 16),
                    ],

                    ElevatedButton(
                      onPressed: _loading ? null : _handleCreate,
                      child: _loading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white))
                          : const Text('Join the League 🥦'),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }
}
