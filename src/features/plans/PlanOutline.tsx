import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { InlineEdit } from "@/components/RowActions";
import { AiOffNote } from "@/components/AiOffNote";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineInput } from "@/components/ui/inline-input";
import { PlainButton } from "@/components/ui/plain-button";
import {
  joinText,
  nodeAt,
  parseIndentedText,
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
import { addIdea, addTree, nodeActions } from "./planActions";

const key = (p: NodePath): string => p.join(".");

/**
 * "+ Add an idea": write the ideas one after the other. Enter adds one and the field stays;
 * Tab makes the next one a smaller part of the one just written, Shift+Tab goes back up a level.
 * A pasted list (one idea on each line, indented for smaller parts) becomes a tree at once.
 * Nothing is tied to anything: that can be done later, idea by idea, from ···.
 */
function AddIdea({
  parent,
  label,
  autoFocus,
  onDone,
}: {
  parent: NodePath;
  label: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const [text, setLocal] = useState("");
  const [at, setAt] = useState<NodePath>(parent);
  const [last, setLast] = useState<NodePath | null>(null);
  const depth = at.length - parent.length;
  const submit = async (): Promise<void> => {
    const t = text.trim();
    if (t === "") return;
    setLocal("");
    const state = usePlanStore.getState().nodes;
    const siblings = at.length === 0 ? state : (nodeAt(state, at)?.children ?? []);
    setLast([...at, siblings.length]);
    await addIdea(at, t);
  };
  return (
    <form
      className="py-0.5"
      style={{ paddingLeft: depth * 24 }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <InlineInput
        aria-label={label}
        placeholder={depth > 0 ? `${label} (a smaller part)` : label}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => {
          setLocal(e.target.value);
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (!/\r?\n/.test(pasted.trim())) return;
          e.preventDefault();
          void addTree(at, parseIndentedText(pasted));
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setLocal("");
            onDone?.();
          } else if (e.key === "Tab") {
            e.preventDefault();
            if (e.shiftKey) {
              if (at.length > parent.length) {
                setLast(at);
                setAt(at.slice(0, -1));
              }
            } else if (last !== null) {
              setAt(last);
              setLast(null);
            }
          }
        }}
        onBlur={() => {
          if (text.trim() === "") onDone?.();
        }}
        className="w-full rounded-md border border-dashed border-input bg-transparent px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:border-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </form>
  );
}

function Row({
  node,
  path,
  ctx,
  folded,
  toggle,
  editing,
  setEditing,
}: {
  node: PlanNode;
  path: NodePath;
  ctx: InfoContext;
  folded: ReadonlySet<string>;
  toggle: (p: NodePath) => void;
  editing: string | null;
  setEditing: (k: string | null) => void;
}) {
  const selected = usePlanStore((s) => s.selected);
  const adding = usePlanStore((s) => s.adding);
  const aiOff = useAiBlocked();
  const info = infoFor(node, ctx);
  const k = key(path);
  const shut = folded.has(k);
  const isSel = samePath(selected, path);
  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-lg px-2 py-1",
          isSel ? "bg-accent" : "hover:bg-muted",
        )}
      >
        {node.children.length > 0 ? (
          <PlainButton
            type="button"
            aria-expanded={!shut}
            aria-label={`${shut ? "Unfold" : "Fold"} ${info.plain}`}
            className="rounded p-0.5 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              toggle(path);
            }}
          >
            {shut ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </PlainButton>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            node.children.length > 0 ? "bg-primary" : "bg-input",
          )}
        />
        {editing === k ? (
          <InlineEdit
            value={info.plain}
            label={`Words of ${info.plain}`}
            className="text-sm"
            onSave={(t) => {
              setEditing(null);
              const links = splitText(node.text).links;
              void usePlanStore
                .getState()
                .edit((nodes) => setText(nodes, path, joinText(t, links)));
            }}
            onCancel={() => {
              setEditing(null);
            }}
          />
        ) : (
          <>
            <PlainButton
              type="button"
              className={cn(
                "min-w-0 truncate text-left text-sm focus-visible:ring-2 focus-visible:ring-ring",
                node.children.length > 0 && "font-semibold",
              )}
              onClick={() => {
                usePlanStore.getState().select(path);
              }}
              onDoubleClick={() => {
                setEditing(k);
              }}
              title="Click to choose, double-click to change the words"
            >
              {info.plain || "(empty)"}
            </PlainButton>
            <span className="flex-1" />
          </>
        )}
        <NodeChips info={info} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <PlainButton
              type="button"
              aria-label={`More for ${info.plain}`}
              className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 hover:bg-card focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </PlainButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {aiOff !== null && <AiOffNote reason={aiOff} />}
            {nodeActions(path).map((a, i) => (
              <div key={a.id}>
                {(a.id === "up" || a.id === "delete") && i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  disabled={a.needsAi === true && aiOff !== null}
                  onSelect={a.run}
                  className={cn(a.id === "delete" && "text-destructive")}
                >
                  {a.label}
                </DropdownMenuItem>
              </div>
            ))}
            <DropdownMenuItem
              onSelect={() => {
                setEditing(k);
              }}
            >
              Change the words
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!shut && (node.children.length > 0 || samePath(adding, path)) && (
        <ul className="ml-6 border-l pl-2">
          {node.children.map((c, i) => (
            <Row
              key={`${k}.${String(i)}`}
              node={c}
              path={[...path, i]}
              ctx={ctx}
              folded={folded}
              toggle={toggle}
              editing={editing}
              setEditing={setEditing}
            />
          ))}
          {samePath(adding, path) && (
            <li>
              <AddIdea
                parent={path}
                label={`A sub-idea of ${info.plain}`}
                autoFocus
                onDone={() => {
                  usePlanStore.getState().setAdding(null);
                }}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/** The ideas of the open plan as an outline: fold a branch, choose an idea, or press ··· for more. */
export function PlanOutline({ nodes, ctx }: { nodes: readonly PlanNode[]; ctx: InfoContext }) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const toggle = (p: NodePath): void => {
    setFolded((f) => {
      const next = new Set(f);
      if (next.has(key(p))) next.delete(key(p));
      else next.add(key(p));
      return next;
    });
  };
  return (
    <div className="flex flex-col gap-1" aria-label="Ideas">
      <ul className="flex flex-col">
        {nodes.map((n, i) => (
          <Row
            key={String(i)}
            node={n}
            path={[i]}
            ctx={ctx}
            folded={folded}
            toggle={toggle}
            editing={editing}
            setEditing={setEditing}
          />
        ))}
      </ul>
      <div className="pl-7">
        <AddIdea parent={[]} label="+ Add an idea" />
      </div>
    </div>
  );
}
