import { ChevronRight } from "lucide-react";
import * as Primitive from "@radix-ui/react-context-menu";
import * as React from "react";
import { cn } from "@/lib/utils";
import {
  menuContent,
  menuItem,
  menuLabel,
  menuSeparator,
  menuShortcut,
  menuSubContent,
  menuSubTrigger,
} from "./menuStyles";

export const ContextMenu = Primitive.Root;
export const ContextMenuTrigger = Primitive.Trigger;
export const ContextMenuSub = Primitive.Sub;

export function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.SubTrigger>) {
  return (
    <Primitive.SubTrigger className={cn(menuSubTrigger, className)} {...props}>
      {children}
      <ChevronRight className="ml-auto text-muted-foreground" aria-hidden />
    </Primitive.SubTrigger>
  );
}

export function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.SubContent>) {
  return (
    <Primitive.Portal>
      <Primitive.SubContent className={cn(menuSubContent, className)} {...props} />
    </Primitive.Portal>
  );
}

export function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content className={cn(menuContent, className)} {...props} />
    </Primitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn(menuItem, className)} {...props} />;
}

/** A shortcut hint at the right end of a menu item. */
export function ContextMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn(menuShortcut, className)} {...props} />;
}

export function ContextMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label className={cn(menuLabel, className)} {...props} />;
}

export function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn(menuSeparator, className)} {...props} />;
}
