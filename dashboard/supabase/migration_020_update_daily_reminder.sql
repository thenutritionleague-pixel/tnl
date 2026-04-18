-- Update the daily reminder cron job to use generic language
-- (not specific to "healthy habits" — challenges can be any topic)

select cron.unschedule('daily-activity-reminder');

select cron.schedule(
  'daily-activity-reminder',
  '0 8 * * *',
  $$
    insert into feed_items (org_id, type, title, content, challenge_id, is_auto_generated)
    select
      c.org_id,
      'announcement',
      '🌟 New day, new points!',
      'Don''t forget to complete today''s tasks. Every submission counts toward your team''s score!',
      c.id,
      true
    from challenges c
    where c.status = 'active';
  $$
);
