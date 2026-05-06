import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Mixin for screens that need to wait for a valid, refreshed Supabase session
/// before loading data. Solves the "stuck skeleton" problem caused by:
///   - `currentUser` being non-null during a mid-flight token refresh
///   - Silent API failures leaving `_loading = true` forever
///
/// Usage:
///   class _MyScreenState extends State<MyScreen> with SessionAwareMixin {
///     @override
///     void initState() {
///       super.initState();
///       waitForSession(then: _load);
///     }
///
///     Future<void> _load() async {
///       try {
///         ...
///       } catch (e) {
///         if (handleLoadError(e)) return; // auth error → auto sign-out
///         if (mounted) setState(() => _loadError = true);
///       }
///     }
///   }
mixin SessionAwareMixin<T extends StatefulWidget> on State<T> {
  StreamSubscription<AuthState>? _authSub;
  Timer? _sessionTimeout;

  /// Waits for a confirmed session (handles mid-flight token refresh),
  /// then calls [then]. Falls back to [onNoSession] if no session arrives
  /// within 8 seconds, or redirects to /login if [redirectIfNone] is true.
  void waitForSession({
    required VoidCallback then,
    VoidCallback? onNoSession,
    bool redirectIfNone = true,
  }) {
    final session = Supabase.instance.client.auth.currentSession;

    if (session != null && !_isExpiringSoon(session)) {
      // Session is already valid and not about to expire — load immediately
      then();
      return;
    }

    // Session is null or being refreshed — wait for the next auth event
    debugPrint('SESSION_AWAIT: waiting for token refresh...');
    _authSub = Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      final s = data.session;
      if (s != null) {
        debugPrint('SESSION_READY: session confirmed, loading data');
        _authSub?.cancel();
        _sessionTimeout?.cancel();
        if (mounted) then();
      } else if (data.event == AuthChangeEvent.signedOut) {
        _authSub?.cancel();
        _sessionTimeout?.cancel();
        if (mounted && redirectIfNone) context.go('/login');
      }
    });

    // Safety net: if no session arrives within 8s, give up gracefully
    _sessionTimeout = Timer(const Duration(seconds: 8), () {
      _authSub?.cancel();
      if (!mounted) return;
      final fallbackSession = Supabase.instance.client.auth.currentSession;
      if (fallbackSession != null) {
        then();
      } else {
        debugPrint('SESSION_TIMEOUT: no session after 8s');
        if (onNoSession != null) {
          onNoSession();
        } else if (redirectIfNone) {
          context.go('/login');
        }
      }
    });
  }

  /// Call from every _load() catch block.
  ///
  /// Returns true if [error] was an auth/session error — in that case the user
  /// is automatically signed out and sent to /login so they get a fresh token.
  /// Returns false for any other error, letting the caller show its own error UI.
  bool handleLoadError(Object error) {
    if (!_isAuthError(error)) return false;
    debugPrint('AUTH_ERROR_AUTO_SIGNOUT: $error');
    if (!mounted) return true;
    Supabase.instance.client.auth.signOut().then((_) {
      if (mounted) context.go('/login');
    });
    return true;
  }

  /// Detects auth/session errors from Supabase.
  static bool _isAuthError(Object error) {
    if (error is AuthException) return true;
    if (error is PostgrestException) {
      final code = error.code ?? '';
      final msg = error.message.toLowerCase();
      // 401 = unauthorized, 403 = forbidden
      if (code == '401' || code == '403') return true;
      // JWT-related error messages
      if (msg.contains('jwt') || msg.contains('invalid_jwt') ||
          msg.contains('token is expired') || msg.contains('not authenticated') ||
          msg.contains('session') || msg.contains('no api key')) return true;
    }
    // Catch-all: error string inspection
    final str = error.toString().toLowerCase();
    if (str.contains('jwt expired') || str.contains('invalid_jwt') ||
        str.contains('not authenticated') || str.contains('refresh_token_not_found')) {
      return true;
    }
    return false;
  }

  bool _isExpiringSoon(Session session) {
    // If the token expires within the next 30 seconds, treat as "refreshing"
    final expiresAt = session.expiresAt;
    if (expiresAt == null) return false;
    final expiresAtDt = DateTime.fromMillisecondsSinceEpoch(expiresAt * 1000);
    return expiresAtDt.isBefore(DateTime.now().add(const Duration(seconds: 30)));
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _sessionTimeout?.cancel();
    super.dispose();
  }
}
