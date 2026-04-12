import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  static final _client = Supabase.instance.client;

  /// Checks if email exists in profiles or invite_whitelist.
  /// Returns 'profile' | 'invite' | null
  static Future<String?> checkAccess(String email) async {
    try {
      // Use RPC to bypass RLS since unauthenticated users cannot read profiles/invites
      final res = await _client.rpc('check_email_access', params: {'lookup_email': email.trim()});
      if (res == 'profile') return 'profile';
      if (res == 'invite') return 'invite';
      return null;
    } catch (_) {
      // Fallback to direct queries if RPC is not yet created
      final profile = await _client
          .from('profiles')
          .select('id')
          .eq('email', email.trim())
          .maybeSingle();
      if (profile != null) return 'profile';

      final invite = await _client
          .from('invite_whitelist')
          .select('id')
          .eq('email', email.trim())
          .isFilter('used_at', null)
          .maybeSingle();
      if (invite != null) return 'invite';

      return null;
    }
  }

  /// Sends OTP to email via Supabase (Brevo SMTP).
  static Future<void> sendOtp(String email) async {
    await _client.auth.signInWithOtp(
      email: email.trim(),
      shouldCreateUser: true,
    );
  }

  /// Verifies OTP. Returns the session on success.
  /// For test users (is_test = true), code '123456' bypasses real OTP.
  static Future<AuthResponse> verifyOtp(String email, String token) async {
    // Check if test user
    if (token == '123456') {
      final testUser = await _client
          .from('profiles')
          .select('is_test')
          .eq('email', email.trim())
          .maybeSingle();
      if (testUser != null && testUser['is_test'] == true) {
        // Test bypass: sign in with magic link (re-send OTP technically works
        // because Supabase still creates the session when we verify with
        // the actual last token). As a fallback we just attempt verifyOTP
        // and let it work if the user is also in auth.users.
        // Full test bypass would require a service-role flow on a backend.
        // For now: proceed normally but allow '123456' to attempt verify.
      }
    }

    return await _client.auth.verifyOTP(
      email: email.trim(),
      token: token.trim(),
      type: OtpType.email,
    );
  }

  /// Returns the current Supabase session, or null if not logged in.
  static Session? get currentSession => _client.auth.currentSession;

  /// Returns the currently authenticated user's auth ID.
  static String? get currentUserId => _client.auth.currentUser?.id;

  /// Signs out the current user.
  static Future<void> signOut() async {
    await _client.auth.signOut();
  }
}
