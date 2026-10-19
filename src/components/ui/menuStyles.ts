/** The look shared by every menu (drop-down and right-click), so they all work and read alike. */
export const menuContent = "z-50 min-w-56 rounded-md border bg-card p-1 text-sm shadow-lg";
export const menuSubContent = `${menuContent} max-h-96 overflow-auto`;
export const menuItem =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0";
export const menuSubTrigger = `${menuItem} data-[state=open]:bg-accent`;
export const menuLabel = "px-2 pb-0.5 pt-1.5 section-label";
export const menuShortcut =
  "ml-auto rounded border px-1 text-[10px] leading-4 text-muted-foreground";
export const menuSeparator = "-mx-1 my-1 h-px bg-border";
