import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../features/auth/screens/splash_screen.dart';
import '../features/auth/screens/login_screen.dart';
import '../features/auth/screens/signup_screen.dart';
import '../features/home/screens/home_screen.dart';
import '../features/tasks/screens/tasks_screen.dart';
import '../features/tasks/screens/task_submission_screen.dart';
import '../features/tasks/screens/task_history_screen.dart';
import '../features/leaderboard/screens/leaderboard_screen.dart';
import '../features/feed/screens/feed_screen.dart';
import '../features/more/screens/more_screen.dart';
import '../features/profile/screens/profile_screen.dart';
import '../features/events/screens/events_screen.dart';
import '../features/chat/screens/chat_screen.dart';
import '../features/policies/screens/policies_screen.dart';
import '../features/policies/screens/policy_detail_screen.dart';
import '../features/more/screens/about_screen.dart';
import '../features/profile/screens/edit_profile_screen.dart';
import 'main_shell.dart';

final GoRouter appRouter = GoRouter(
  initialLocation: '/splash',
  redirect: (context, state) {
    final session = Supabase.instance.client.auth.currentSession;
    final isAuth = session != null;
    final loc = state.uri.toString();

    // If going to splash let it handle its own logic
    if (loc == '/splash') return null;

    // If logged in and trying to reach auth screens → send to home
    if (isAuth && (loc == '/login' || loc == '/signup')) return '/home';

    // If not logged in and trying to reach protected routes → login
    final publicRoutes = ['/login', '/signup', '/splash'];
    if (!isAuth && !publicRoutes.contains(loc)) return '/login';

    return null;
  },
  routes: [
    GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(
      path: '/signup',
      builder: (context, state) {
        final extra = state.extra as Map<String, dynamic>? ?? {};
        return SignupScreen(
          email: extra['email'] as String? ?? '',
          orgId: extra['orgId'] as String? ?? '',
          inviteId: extra['inviteId'] as String?,
          teamId: extra['teamId'] as String?,
        );
      },
    ),
    ShellRoute(
      builder: (context, state, child) => MainShell(child: child),
      routes: [
        GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
        GoRoute(path: '/tasks', builder: (context, state) => const TasksScreen()),
        GoRoute(path: '/tasks/history', builder: (context, state) => const TaskHistoryScreen()),
        GoRoute(
          path: '/tasks/submit',
          builder: (context, state) {
            final task = state.extra as Map<String, dynamic>? ?? {};
            return TaskSubmissionScreen(task: task);
          },
        ),
        GoRoute(path: '/leaderboard', builder: (context, state) => const LeaderboardScreen()),
        GoRoute(path: '/feed', builder: (context, state) => const FeedScreen()),
        GoRoute(path: '/more', builder: (context, state) => const MoreScreen()),
        GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
        GoRoute(
          path: '/profile/edit',
          builder: (context, state) {
            final profile = state.extra as Map<String, dynamic>? ?? {};
            return EditProfileScreen(profile: profile);
          },
        ),
        GoRoute(path: '/events', builder: (context, state) => const EventsScreen()),
        GoRoute(
          path: '/chat',
          builder: (context, state) {
            final extra = state.extra as Map<String, dynamic>? ?? {};
            return ChatScreen(
              teamId: extra['teamId'] as String? ?? '',
              teamName: extra['teamName'] as String? ?? 'Team Chat',
            );
          },
        ),
        GoRoute(path: '/policies', builder: (context, state) => const PoliciesScreen()),
        GoRoute(
          path: '/policies/detail',
          builder: (context, state) {
            final extra = state.extra as Map<String, dynamic>? ?? {};
            return PolicyDetailScreen(
              title: extra['title'] as String? ?? '',
              content: extra['content'] as String? ?? '',
              iconColor: extra['iconColor'] as Color? ?? const Color(0xFF059669),
              iconBg: extra['iconBg'] as Color? ?? const Color(0xFFECFDF5),
              icon: extra['icon'] as IconData? ?? Icons.description_outlined,
            );
          },
        ),
        GoRoute(path: '/about', builder: (context, state) => const AboutScreen()),
      ],
    ),
  ],
);
