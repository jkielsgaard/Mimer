# Meetings

A meeting is a note with the tag `meeting` and the properties `meeting: YYYY-MM-DD HH:MM` and `with: [..]`; `parts: [agenda, decisions, actions]` says which parts it has (none written = all three, for a meeting made before the parts; a new meeting has none until they are ticked); `## Agenda` holds `- [ ]` items, `## Notes` is one text for the whole meeting, `## Decisions` holds `- ` lines and `## Actions` holds tasks (`src/lib/meeting.ts`). The Meetings area (calendar, Today/Upcoming/Past/No date, the meeting page), the meeting form, the meeting screen (`MeetingFocus`), Start meeting and Prepare next, and the next-meeting line in Landing.

- Nothing is stored apart from the note: every list is read from the tagged notes (`tagged_notes`, `meetingStore`, one read at a time).
- Changing a meeting changes only its properties (`setMeetingWhen`, `setMeetingParts`), never the body. A part switched off is hidden, its section stays.
- The agenda does not hold the notes: clicking an item only marks it "Now". The notes of a meeting made before the parts existed keep their `### item` headings as plain text.
- The parts chosen for a new meeting are remembered per computer (`mimer.meetingParts`).
- Times follow the time format setting (`formatTime`, `TimeInput`); the note always stores `HH:MM`.
