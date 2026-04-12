import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/event_service.dart';
import '../../../core/services/profile_service.dart';

class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _events = [];
  String? _profileId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final authId = Supabase.instance.client.auth.currentUser?.id;
    if (authId == null) return;

    try {
      final profile = await ProfileService.getProfile(authId);
      if (profile == null) return;
      final events = await EventService.getEvents(profile['org_id']);
      if (mounted) {
        setState(() {
          _profileId = profile['id'];
          _events = events;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _join(String eventId) async {
    if (_profileId == null) return;
    try {
      await EventService.joinEvent(eventId: eventId, userId: _profileId!);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You joined the event! 🎉'), backgroundColor: AppColors.success),
      );
      _load();
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not join event.'), backgroundColor: AppColors.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Events'), backgroundColor: AppColors.surface),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : RefreshIndicator(
              onRefresh: _load,
              color: AppColors.primary,
              child: _events.isEmpty
                  ? const Center(child: Text('No upcoming events.', style: TextStyle(color: AppColors.textSecondary)))
                  : ListView.builder(
                      padding: const EdgeInsets.all(20),
                      itemCount: _events.length,
                      itemBuilder: (context, i) {
                        final e = _events[i];
                        final participations = e['event_participations'] as List? ?? [];
                        final hasJoined = participations.any((p) => p['user_id'] == _profileId);
                        final attendeeCount = participations.length;
                        final type = e['type'] as String? ?? 'other';
                        final points = e['points'] as int? ?? 0;
                        final location = e['location'] as String? ?? '';

                        return Container(
                          margin: const EdgeInsets.only(bottom: 14),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Type banner
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                decoration: BoxDecoration(
                                  color: type == 'quiz' ? AppColors.primarySurface : const Color(0xFFFFF7ED),
                                  borderRadius: const BorderRadius.only(
                                    topLeft: Radius.circular(20),
                                    topRight: Radius.circular(20),
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Text(type == 'quiz' ? '📝 Quiz' : type == 'offline' ? '🏃 Offline' : '📅 Event',
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                          color: type == 'quiz' ? AppColors.primary : Colors.orange[700],
                                        )),
                                    const Spacer(),
                                    if (points > 0)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: AppColors.pointsBadge,
                                          borderRadius: BorderRadius.circular(20),
                                          border: Border.all(color: AppColors.pointsBadgeBorder),
                                        ),
                                        child: Text('🥦 $points pts',
                                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.pointsText)),
                                      ),
                                  ],
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(e['title'] as String? ?? '',
                                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                                    if ((e['description'] as String? ?? '').isNotEmpty) ...[
                                      const SizedBox(height: 4),
                                      Text(e['description'] as String,
                                          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                                    ],
                                    const SizedBox(height: 12),
                                    Row(
                                      children: [
                                        if (location.isNotEmpty) ...[
                                          const Icon(Icons.location_on_outlined, size: 14, color: AppColors.textHint),
                                          const SizedBox(width: 4),
                                          Text(location, style: const TextStyle(fontSize: 12, color: AppColors.textHint)),
                                          const SizedBox(width: 14),
                                        ],
                                        const Icon(Icons.people_outline_rounded, size: 14, color: AppColors.textHint),
                                        const SizedBox(width: 4),
                                        Text('$attendeeCount joined', style: const TextStyle(fontSize: 12, color: AppColors.textHint)),
                                      ],
                                    ),
                                    const SizedBox(height: 14),
                                    SizedBox(
                                      width: double.infinity,
                                      child: ElevatedButton(
                                        onPressed: hasJoined ? null : () => _join(e['id']),
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor: hasJoined ? AppColors.success : AppColors.primary,
                                          minimumSize: const Size(double.infinity, 44),
                                        ),
                                        child: Text(hasJoined ? '✓ Joined' : 'Join Event'),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}
