import { useMemo, useState } from "react";
import { InlineEdit } from "@/components/RowActions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { PlainButton } from "@/components/ui/plain-button";
import {
  joinText,
  samePath,
  setText,
  splitText,
  type NodePath,
  type PlanNode,
} from "@/lib/planTree";
import { cn } from "@/lib/utils";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { usePlanStore } from "@/stores/planStore";
import { NodeChips } from "./NodeChips";
import { infoFor, type InfoContext } from "./nodeInfo";
import { nodeActions } from "./planActions";

const BOX_W = 176;
const BOX_H = 40;
const COL_GAP = 20;
const ROW_GAP = 48;
const PAD = 24;

interface Placed {
  path: NodePath;
  node: PlanNode;
  x: number;
  y: number;
  parent: Placed | null;
}

/**
 * Places every idea from the top down: the plan itself first (the box with the path `[]`), a row
 * for each level below it, and a parent in the middle above its children.
 */
function layout(
  title: string,
  nodes: readonly PlanNode[],
): { placed: Placed[]; width: number; height: number } {
  const placed: Placed[] = [];
  let col = 0;
  let deepest = 0;
  const visit = (node: PlanNode, path: NodePath, parent: Placed | null): Placed => {
    const me: Placed = { path, node, x: 0, y: PAD + path.length * (BOX_H + ROW_GAP), parent };
    deepest = Math.max(deepest, path.length);
    placed.push(me);
    if (node.children.length === 0) {
      me.x = PAD + col * (BOX_W + COL_GAP);
      col += 1;
    } else {
      const kids = node.children.map((c, i) => visit(c, [...path, i], me));
      const first = kids[0];
      const last = kids[kids.length - 1];
      me.x = first && last ? (first.x + last.x) / 2 : PAD;
    }
    return me;
  };
  visit({ text: title, children: [...nodes] }, [], null);
  return {
    placed,
    width: PAD * 2 + Math.max(1, col) * (BOX_W + COL_GAP),
    height: PAD * 2 + (deepest + 1) * (BOX_H + ROW_GAP),
  };
}

/** The ideas of the open plan as a map. It is the same list as the outline. */
export function PlanMap({ nodes, ctx }: { nodes: readonly PlanNode[]; ctx: InfoContext }) {
  const selected = usePlanStore((s) => s.selected);
  const title = usePlanStore((s) => s.title);
  const aiOff = useAiBlocked();
  const [editing, setEditing] = useState<string | null>(null);
  const { placed, width, height } = useMemo(() => layout(title, nodes), [title, nodes]);
  /** What can be done with a box: the plan itself only takes new ideas and AI parts. */
  const actionsFor = (path: NodePath) =>
    nodeActions(path)
      .filter((a) => !["up", "down", "in", "out"].includes(a.id))
      .filter((a) => path.length > 0 || a.id === "sub" || a.id === "parts")
      .map((a) =>
        a.id === "sub"
          ? {
              ...a,
              run: () => {
                usePlanStore.getState().setDialog({ kind: "add", path });
              },
            }
          : a,
      );
  const change = (path: NodePath, node: PlanNode, t: string): void => {
    const links = splitText(node.text).links;
    void usePlanStore.getState().edit((all) => setText(all, path, joinText(t, links)));
  };
  const chosen = selected ? placed.find((p) => samePath(p.path, selected)) : undefined;
  const info = chosen ? infoFor(chosen.node, ctx) : null;

  return (
    <div className="flex h-full min-h-0">
      <div
        className="relative min-w-0 flex-1 overflow-auto"
        style={{
          backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div
          className="relative mx-auto"
          style={{ width: Math.max(width, 600), height: Math.max(height, 300) }}
        >
          {placed.map((p) => {
            if (p.parent === null) return null;
            const pcx = p.parent.x + BOX_W / 2;
            const ccx = p.x + BOX_W / 2;
            const top = p.parent.y + BOX_H;
            const mid = top + ROW_GAP / 2;
            return (
              <div key={`l${p.path.join(".")}`} aria-hidden>
                <div
                  className="absolute bg-input"
                  style={{ left: pcx, top, width: 2, height: ROW_GAP / 2 }}
                />
                <div
                  className="absolute bg-input"
                  style={{
                    left: Math.min(pcx, ccx),
                    top: mid,
                    width: Math.abs(ccx - pcx) + 2,
                    height: 2,
                  }}
                />
                <div
                  className="absolute bg-input"
                  style={{ left: ccx, top: mid, width: 2, height: ROW_GAP / 2 }}
                />
              </div>
            );
          })}
          {placed.map((p) => {
            const isSel = samePath(selected, p.path);
            const isRoot = p.path.length === 0;
            const branch = p.node.children.length > 0 || isRoot;
            const k = p.path.join(".");
            const plain = splitText(p.node.text).plain;
            const pos = { left: p.x, top: p.y, width: BOX_W, height: BOX_H };
            if (editing === k && !isRoot) {
              return (
                <div
                  key={k}
                  className="absolute flex items-center rounded-lg border-2 border-primary bg-card px-2"
                  style={pos}
                >
                  <InlineEdit
                    value={plain}
                    label={`Words of ${plain}`}
                    className="text-sm"
                    onSave={(t) => {
                      setEditing(null);
                      change(p.path, p.node, t);
                    }}
                    onCancel={() => {
                      setEditing(null);
                    }}
                  />
                </div>
              );
            }
            return (
              <ContextMenu key={k}>
                <ContextMenuTrigger asChild>
                  <PlainButton
                    type="button"
                    aria-pressed={isSel}
                    title={isRoot ? plain : `${plain} (double-click to change the words)`}
                    className={cn(
                      "absolute flex items-center rounded-lg border bg-card px-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring",
                      branch && "border-primary font-semibold",
                      isRoot && "bg-primary text-primary-foreground",
                      isSel && "border-2 border-primary bg-accent text-accent-foreground",
                    )}
                    style={pos}
                    onClick={() => {
                      usePlanStore.getState().select(p.path);
                    }}
                    onContextMenu={() => {
                      usePlanStore.getState().select(p.path);
                    }}
                    onDoubleClick={() => {
                      if (!isRoot) setEditing(k);
                    }}
                  >
                    <span className="truncate">{plain || "(empty)"}</span>
                  </PlainButton>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-60">
                  {actionsFor(p.path).map((a, i) => (
                    <div key={a.id}>
                      {a.id === "delete" && i > 0 && <ContextMenuSeparator />}
                      <ContextMenuItem
                        disabled={a.needsAi === true && aiOff !== null}
                        onSelect={a.run}
                        className={cn(a.id === "delete" && "text-destructive")}
                      >
                        {a.label}
                      </ContextMenuItem>
                    </div>
                  ))}
                  {!isRoot && (
                    <ContextMenuItem
                      onSelect={() => {
                        setEditing(k);
                      }}
                    >
                      Change the words
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      </div>
      <aside
        aria-label="The chosen idea"
        className="flex w-72 shrink-0 flex-col gap-3 overflow-auto border-l bg-sidebar p-4"
      >
        {chosen && info ? (
          <>
            <span className="section-label">The chosen idea</span>
            <p className="text-base font-semibold">{info.plain}</p>
            <div className="flex flex-wrap gap-1.5">
              <NodeChips info={info} />
            </div>
            <div className="flex flex-col gap-1.5">
              {actionsFor(chosen.path).map((a) => (
                <Button
                  key={a.id}
                  size="sm"
                  variant="outline"
                  className="justify-start"
                  disabled={a.needsAi === true && aiOff !== null}
                  title={a.needsAi === true ? (aiOff ?? undefined) : undefined}
                  onClick={a.run}
                >
                  {a.label}
                </Button>
              ))}
              {chosen.path.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setEditing(chosen.path.join("."));
                  }}
                >
                  Change the words
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Choose a box to see what you can do with it, or right-click it. The map and the outline
            are the same list: change it in one, and it changes in the other.
          </p>
        )}
      </aside>
    </div>
  );
}
