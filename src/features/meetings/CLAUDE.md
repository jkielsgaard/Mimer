# Meetings

A meeting is a note with the tag `meeting` and the properties `meeting: YYYY-MM-DD HH:MM` and `with: [..]`; `## Agenda` holds `- [ ]` items and `## Notes` has a `### item` part per item (`src/lib/meeting.ts`). The Meetings area (calendar, Today/Upcoming/Past/No date, the meeting page), the meeting form, the meeting screen (`MeetingFocus`), Start meeting and Prepare next, and the next-meeting line in Landing.

- Nothing is stored apart from the note: every list is read from the tagged notes (`tagged_notes`, `meetingStore`, one read at a time).
- Changing a meeting changes only its properties (`setMeetingWhen`), never the body.
- Times follow the time format setting (`formatTime`, `TimeInput`); the note always stores `HH:MM`.
