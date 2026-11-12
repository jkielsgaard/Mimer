/** The kinds of Mermaid diagram the AI is allowed to answer with. */
const STARTS = /^(flowchart|graph)\s+(LR|RL|TB|TD|BT)\b/i;

/** Whether an AI answer is Mermaid flowchart code and not a sentence about one. */
export function looksLikeDiagram(text: string): boolean {
  const first = text.trim().split("\n")[0] ?? "";
  return STARTS.test(first.trim()) && text.includes("-->");
}

/** The selected text with the diagram under it, as a Mermaid code block. */
export function withDiagram(text: string, code: string): string {
  return `${text.replace(/\s+$/, "")}\n\n\`\`\`mermaid\n${code.trim()}\n\`\`\`\n`;
}
