import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/chat_service.dart';
import '../../../core/services/profile_service.dart';
import '../../../core/widgets/user_avatar.dart';
import '../../../core/theme/theme_colors.dart';

class ChatScreen extends StatefulWidget {
  final String teamId;
  final String teamName;

  const ChatScreen({super.key, required this.teamId, required this.teamName});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  bool _loading = true;
  List<Map<String, dynamic>> _messages = [];
  String? _profileId;
  String? _myName;
  String? _myAvatarColor;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final authId = Supabase.instance.client.auth.currentUser?.id;
    if (authId == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }

    try {
      final profile = await ProfileService.getProfile(authId);
      if (profile == null) {
        if (mounted) setState(() => _loading = false);
        return;
      }

      final messages = await ChatService.getMessages(widget.teamId);

      if (mounted) {
        setState(() {
          _profileId = profile['id'];
          _myName = profile['name'] as String?;
          _myAvatarColor = profile['avatar_color'] as String?;
          _messages = messages;
          _loading = false;
        });
        _scrollToBottom();
      }

      // Subscribe to new messages
      ChatService.subscribeMessages(widget.teamId, (msg) {
        if (mounted) {
          // Enrich realtime payload with profile data
          if (msg['profiles'] == null) {
            if (msg['user_id'] == _profileId) {
              msg['profiles'] = {'id': _profileId, 'name': _myName, 'avatar_color': _myAvatarColor};
            } else {
              // Find profile from existing messages cache
              final cached = _messages.firstWhere(
                (m) => m['profiles'] != null && (m['profiles'] as Map)['id'] == msg['user_id'],
                orElse: () => {},
              );
              if (cached.containsKey('profiles')) {
                msg['profiles'] = cached['profiles'];
              } else {
                msg['profiles'] = {'id': msg['user_id'], 'name': 'User', 'avatar_color': '#059669'};
              }
            }
          }
          setState(() => _messages.add(msg));
          _scrollToBottom();
        }
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    ChatService.unsubscribe();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _profileId == null) return;
    _controller.clear();
    await ChatService.sendMessage(
      teamId: widget.teamId,
      userId: _profileId!,
      content: text,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.teamName),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : Column(
              children: [
                Expanded(
                  child: _messages.isEmpty
                      ? Center(
                          child: Text('No messages yet. Say hi! 👋',
                              style: TextStyle(color: context.textSecondary)))
                      : ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          itemCount: _messages.length,
                          itemBuilder: (context, i) {
                            final msg = _messages[i];
                            final sender = msg['profiles'] as Map? ?? {};
                            final senderId = sender['id'] as String? ?? '';
                            final senderName = sender['name'] as String? ?? 'Member';
                            final avatarColor = sender['avatar_color'] as String?;
                            final isMe = senderId == _profileId;
                            final content = msg['content'] as String? ?? '';

                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Row(
                                mainAxisAlignment:
                                    isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  if (!isMe) ...[
                                    UserAvatar(name: senderName, avatarColor: avatarColor, radius: 16),
                                    const SizedBox(width: 8),
                                  ],
                                  Flexible(
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                      decoration: BoxDecoration(
                                        color: isMe ? AppColors.primary : AppColors.surface,
                                        borderRadius: BorderRadius.only(
                                          topLeft: const Radius.circular(18),
                                          topRight: const Radius.circular(18),
                                          bottomLeft: Radius.circular(isMe ? 18 : 4),
                                          bottomRight: Radius.circular(isMe ? 4 : 18),
                                        ),
                                        border: isMe ? null : Border.all(color: context.borderColor),
                                      ),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          if (!isMe)
                                            Text(senderName,
                                                style: TextStyle(
                                                    fontSize: 11,
                                                    fontWeight: FontWeight.w600,
                                                    color: isMe
                                                        ? Colors.white70
                                                        : AppColors.primary)),
                                          Text(content,
                                              style: TextStyle(
                                                  fontSize: 14,
                                                  color: isMe ? Colors.white : context.textPrimary)),
                                        ],
                                      ),
                                    ),
                                  ),
                                  if (isMe) ...[
                                    const SizedBox(width: 8),
                                    UserAvatar(
                                        name: _myName ?? 'Me',
                                        avatarColor: _myAvatarColor,
                                        radius: 16),
                                  ],
                                ],
                              ),
                            );
                          },
                        ),
                ),

                // Input bar
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10)
                      .add(EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom)),
                  decoration: BoxDecoration(
                    color: context.surfaceColor,
                    border: Border(top: BorderSide(color: context.borderColor)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          textCapitalization: TextCapitalization.sentences,
                          decoration: InputDecoration(
                            hintText: 'Message...',
                            filled: true,
                            fillColor: context.bgColor,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide.none,
                            ),
                          ),
                          onSubmitted: (_) => _send(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: _send,
                        child: Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}
