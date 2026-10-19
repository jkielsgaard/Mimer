import { ChevronRight } from "lucide-react";
import * as Primitive from "@radix-ui/react-dropdown-menu";
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

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuSub = Primitive.Sub;

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align="start"
        sideOffset={4}
        className={cn(menuContent, className)}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn(menuItem, className)} {...props} />;
}

/** A heading over a group of items. */
export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label className={cn(menuLabel, className)} {...props} />;
}

/** A shortcut hint at the right end of a menu item. */
export function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn(menuShortcut, className)} {...props} />;
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn(menuSeparator, className)} {...props} />;
}

export function DropdownMenuSubTrigger({
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

export function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.SubContent>) {
  return (
    <Primitive.Portal>
      <Primitive.SubContent sideOffset={2} className={cn(menuSubContent, className)} {...props} />
    </Primitive.Portal>
  );
}
