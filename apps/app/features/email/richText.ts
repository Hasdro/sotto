/** Markdown helpers for the rich-text format fields (D-080): bold, italic, bullet lists and
 * links, as plain text the server renders into the HTML part of the email. Pure functions, so
 * the toolbar behaviour is unit-tested without rendering a TextInput. */

export type Selection = { start: number; end: number };

export type Edit = { text: string; selection: Selection };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function selOf(text: string, sel: Selection): Selection {
  return { start: clamp(sel.start, 0, text.length), end: clamp(sel.end, 0, text.length) };
}

/** Wrap the selection in `before`/`after`; an empty selection inserts both with the cursor
 * between them. Wrapping what is already wrapped unwraps it again. */
export function wrap(text: string, sel: Selection, before: string, after: string): Edit {
  const { start, end } = selOf(text, sel);
  if (start === end) {
    return {
      text: text.slice(0, start) + before + after + text.slice(end),
      selection: { start: start + before.length, end: start + before.length },
    };
  }
  const selected = text.slice(start, end);
  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selection: { start, end: end - before.length - after.length },
    };
  }
  return {
    text: text.slice(0, start) + before + selected + after + text.slice(end),
    selection: { start: start + before.length, end: end + before.length },
  };
}

export function applyBold(text: string, sel: Selection): Edit {
  return wrap(text, sel, "**", "**");
}

export function applyItalic(text: string, sel: Selection): Edit {
  return wrap(text, sel, "*", "*");
}

export function applyLink(text: string, sel: Selection): Edit {
  return wrap(text, sel, "[", "](https://)");
}

/** Prefix every non-empty line the selection touches with "- "; lines that all start with
 * "- " lose it again. */
export function applyList(text: string, sel: Selection): Edit {
  const { start, end } = selOf(text, sel);
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const to = end === start ? start : text.indexOf("\n", end);
  const until = to === -1 ? text.length : to;
  const chunk = text.slice(from, until);
  const lines = chunk.split("\n");
  const listed = lines.filter((l) => l.trim()).every((l) => l.startsWith("- "));
  const changed = lines
    .map((l) => {
      if (!l.trim()) return l;
      return listed ? l.replace(/^- /, "") : `- ${l.replace(/^- /, "")}`;
    })
    .join("\n");
  return {
    text: text.slice(0, from) + changed + text.slice(until),
    selection: { start: from, end: from + changed.length },
  };
}
