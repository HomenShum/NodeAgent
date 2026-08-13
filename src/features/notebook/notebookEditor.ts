/**
 * Notebook editor — the document model behind the TipTap notebook surface.
 *
 * The rich-text rendering (slash menu, block handles, claim cards) lives in the
 * React/HTML layer; this module is the structured, testable core: blocks,
 * claim/citation/entity insertion, and markdown export for shareable memos.
 *
 * Distilled from NodeBench AI `RichNotebookEditor` + `nbClaim` / `nbProposal`
 * extensions, reduced to an immutable, dependency-free document model.
 *
 * Reliability: BOUND (MAX_BLOCKS), DETERMINISTIC (block ids derive from doc
 * state + an injectable clock, so the same operations produce the same doc).
 */

import type {
  Citation,
  NotebookBlock,
  NotebookDoc,
} from "../node-agent/types/nodeAgentTypes";

const MAX_BLOCKS = 2000;

export function createNotebook(
  title: string,
  now: number = Date.now(),
): NotebookDoc {
  return {
    id: `nb_${slug(title)}`,
    title,
    blocks: [{ id: "b0", type: "heading", text: title }],
    updatedAt: now,
  };
}

/** Deterministic next block id from current length. */
function nextId(doc: NotebookDoc): string {
  return `b${doc.blocks.length}`;
}

function withBlock(
  doc: NotebookDoc,
  block: NotebookBlock,
  now: number,
): NotebookDoc {
  if (doc.blocks.length >= MAX_BLOCKS) return doc; // BOUND — silently cap, caller can check length
  return { ...doc, blocks: [...doc.blocks, block], updatedAt: now };
}

export function appendParagraph(
  doc: NotebookDoc,
  text: string,
  now: number = Date.now(),
): NotebookDoc {
  return withBlock(doc, { id: nextId(doc), type: "paragraph", text }, now);
}

/**
 * Insert a claim block carrying its evidence + grounded ratio. This is the unit
 * that makes a memo defensible: a statement with the citations that support it.
 */
export function insertClaim(
  doc: NotebookDoc,
  args: { text: string; evidence: Citation[]; groundedRatio?: string },
  now: number = Date.now(),
): NotebookDoc {
  return withBlock(
    doc,
    {
      id: nextId(doc),
      type: "claim",
      text: args.text,
      evidence: args.evidence,
      groundedRatio: args.groundedRatio ?? `${args.evidence.length}/${args.evidence.length}`,
    },
    now,
  );
}

export function insertCitation(
  doc: NotebookDoc,
  citation: Citation,
  now: number = Date.now(),
): NotebookDoc {
  const text = citation.url
    ? `${citation.title} — ${citation.url}`
    : citation.title;
  return withBlock(
    doc,
    { id: nextId(doc), type: "citation", text, evidence: [citation] },
    now,
  );
}

/** Render the notebook to markdown — the shareable artifact. */
export function toMarkdown(doc: NotebookDoc): string {
  const lines: string[] = [];
  for (const b of doc.blocks) {
    switch (b.type) {
      case "heading":
        lines.push(`# ${b.text}`, "");
        break;
      case "paragraph":
        lines.push(b.text, "");
        break;
      case "claim": {
        const cites = (b.evidence ?? []).map((c) => `[${c.index}]`).join(" ");
        lines.push(`> **Claim** (${b.groundedRatio ?? "?"}): ${b.text} ${cites}`.trim(), "");
        break;
      }
      case "citation": {
        const c = b.evidence?.[0];
        lines.push(`- ${c ? `[${c.index}] ` : ""}${b.text}`, "");
        break;
      }
      case "entity":
        lines.push(`${b.text}`, "");
        break;
    }
  }
  return lines.join("\n").trim() + "\n";
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
