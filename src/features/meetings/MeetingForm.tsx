import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TimeInput } from "@/components/TimeInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { buildMeetingNote, todayAndTomorrow } from "@/lib/meeting";
import { fileNameFrom } from "@/lib/noteTitle";
import { useMeetingStore } from "@/stores/meetingStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/**
 * "Meeting note…": a few optional questions, then a note in the meetings folder. "Create" keeps
 * you where you are; "Create and start" opens the meeting at once.
 */
export function MeetingForm() {
  const open = useUiStore((s) => s.meetingFormOpen);
  const folder = useVaultStore((s) => s.vault?.config.meetingsFolder) ?? "";
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [who, setWho] = useState("");
  const [agenda, setAgenda] = useState("");
  const [busy, setBusy] = useState(false);
  /** The time box holds text that is not a time: nothing is saved until it is fixed. */
  const [timeOk, setTimeOk] = useState(true);

  useEffect(() => {
    if (!open) return;
    // Open from the meeting that was held (the next one), or empty.
    const seed = useUiStore.getState().meetingSeed;
    setTitle(seed?.title ?? "");
    // A new meeting is for today unless another day is picked; the day can be cleared.
    setDate(seed?.date ?? todayAndTomorrow(new Date())[0]);
    setTime(seed?.time ?? "");
    setWho(seed?.who ?? "");
    setAgenda(seed?.agenda ?? "");
    setBusy(false);
    setTimeOk(true);
  }, [open]);

  const close = (): void => {
    useUiStore.getState().setMeetingFormOpen(false);
  };

  const create = async (start: boolean): Promise<void> => {
    if (!timeOk) return;
    setBusy(true);
    try {
      const today = todayAndTomorrow(new Date())[0];
      // A time without a date is today.
      const day = date !== "" ? date : time !== "" ? today : "";
      const text = buildMeetingNote({
        title,
        date: day,
        time,
        people: who.split(","),
        agenda: agenda.split("\n"),
      });
      const name = fileNameFrom(`${day !== "" ? day : today} ${title.trim() || "Meeting"}`);
      await flushPendingWrites();
      const path = await api.createNote(folder, name);
      await api.writeNote(path, text);
      // The Meetings list would otherwise show the note as it was when it was made.
      void useMeetingStore.getState().load();
      close();
      if (start) useUiStore.getState().setMeetingFocus(path);
      else
        useUiStore
          .getState()
          .toast(`Meeting saved in ${folder === "" ? "the vault" : folder}.`, "success");
    } catch (e) {
      reportError(e);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Meeting note</DialogTitle>
          <DialogDescription>
            Everything is optional. The note is saved in {folder === "" ? "the vault" : folder}, and
            you can write in it before, during and after the meeting.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void create(false);
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="meeting-title">Title</Label>
            <Input
              id="meeting-title"
              autoFocus
              placeholder="Weekly with Mette"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="meeting-date">Day</Label>
              <Input
                id="meeting-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="meeting-time">Time</Label>
              <TimeInput id="meeting-time" value={time} onChange={setTime} onValid={setTimeOk} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="meeting-who">With</Label>
            <Input
              id="meeting-who"
              placeholder="Mette, Peter"
              value={who}
              onChange={(e) => {
                setWho(e.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="meeting-agenda">Agenda, one item per line</Label>
            <Textarea
              id="meeting-agenda"
              rows={4}
              placeholder={"Budget\nHiring\nNext release"}
              value={agenda}
              onChange={(e) => {
                setAgenda(e.target.value);
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="outline" disabled={busy || !timeOk}>
              Create
            </Button>
            <Button
              type="button"
              disabled={busy || !timeOk}
              onClick={() => {
                void create(true);
              }}
            >
              Create and start
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
