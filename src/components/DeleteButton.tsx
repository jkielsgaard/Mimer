import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";

/**
 * A Delete button that asks first, in the same window as deleting a note. `what` names the thing
 * ("this task"), `where` says where it can be brought back from.
 */
export function DeleteButton({
  what,
  where,
  onDelete,
}: {
  what: string;
  where: string;
  onDelete: () => void;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setAsking(true);
        }}
      >
        <Trash2 /> Delete
      </Button>
      <ConfirmDialog
        open={asking}
        title={`Delete ${what}?`}
        description={`It is removed, but stays in the version history: ${where}`}
        confirmLabel="Delete"
        destructive
        onCancel={() => {
          setAsking(false);
        }}
        onConfirm={() => {
          setAsking(false);
          onDelete();
        }}
      />
    </>
  );
}
