import { useState } from "react";
import { TimeInput } from "@/components/TimeInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { setMeetingWhen } from "@/lib/meeting";
import type { MeetingNote } from "@/lib/meetingList";
import { useMeetingStore } from "@/stores/meetingStore";
import { reportError } from "@/stores/uiStore";

/**
 * "Change…" on a meeting: the day, the time and who is with. It is the same three fields as the
 * window that makes a meeting, and only those properties of the note change.
 */
export function MeetingWhenDialog({
  meeting,
  open,
  onClose,
}: {
  meeting: MeetingNote;
  open: boolean;
  onClose: () => void;
}) {
  // The dialog is mounted when it opens, so it starts from the meeting as it is then; a reload of
  // the meetings while it is open does not undo what is being typed.
  const [date, setDate] = useState(meeting.meeting.date ?? "");
  const [time, setTime] = useState(meeting.meeting.time ?? "");
  const [who, setWho] = useState(meeting.meeting.people.join(", "));
  const [busy, setBusy] = useState(false);
  const [timeOk, setTimeOk] = useState(true);

  const save = async (): Promise<void> => {
    if (!timeOk) return;
    setBusy(true);
    try {
      await flushPendingWrites();
      const note = await api.readNote(meeting.path);
      const next = setMeetingWhen(note.content, { date, time, people: who.split(",") });
      if (next !== note.content) await api.writeNote(meeting.path, next);
      await useMeetingStore.getState().load();
      onClose();
    } catch (e) {
      reportError(e);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change the meeting</DialogTitle>
          <DialogDescription>
            Only the day, the time and who is with change in the note. Clear the day for a meeting
            without a date.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="when-date">Day</Label>
              <Input
                id="when-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="when-time">Time</Label>
              <TimeInput id="when-time" value={time} onChange={setTime} onValid={setTimeOk} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="when-who">With</Label>
            <Input
              id="when-who"
              placeholder="Mette, Peter"
              value={who}
              onChange={(e) => {
                setWho(e.target.value);
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !timeOk}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
