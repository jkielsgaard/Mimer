import * as Primitive from "@radix-ui/react-context-menu";
import * as React from "react";
import { cn } from "@/lib/utils";

export const ContextMenu = Primitive.Root;
export const ContextMenuTrigger = Primitive.Trigger;

export function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        className={cn("z-50 min-w-48 rounded-md border bg-card p-1 text-sm shadow-lg", className)}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
