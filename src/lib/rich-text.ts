/**
 * Turning model output into something the editor can hold.
 *
 * The model answers in plain text with blank lines between paragraphs. TipTap's
 * `insertContent` takes a string and, given plain text, puts the whole thing in
 * a single paragraph — newlines and all, as literal characters that HTML then
 * collapses to nothing.
 *
 * Measured, not assumed: running "Expand" on one paragraph returned five, and
 * pressing Replace produced a single 2,400-character paragraph containing eight
 * invisible newlines. The student's structure was destroyed at the moment they
 * accepted the suggestion, and it would have exported to Word that way.
 *
 * So the text is converted to real paragraph markup first. Deliberately not a
 * markdown renderer: guessing that `*` means emphasis would mangle a legitimate
 * asterisk, and structure is the part that was actually being lost.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

/**
 * Plain text to paragraph markup.
 *
 * Escaping comes first and is not optional. Handing raw text to `insertContent`
 * as HTML means any `<` in it is parsed as a tag — so a student whose passage
 * discusses `p < 0.05` would lose the rest of the sentence into an unclosed
 * element.
 *
 * A blank line starts a new paragraph; a single newline inside one becomes a
 * line break, which is what it looked like in the answer they just read.
 */
export function plainTextToHtml(text: string): string {
  const escaped = text.replace(/[&<>]/g, (character) => ESCAPES[character]!);

  return escaped
    .split(/\r?\n[ \t]*\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\r?\n/g, "<br>")}</p>`)
    .join("");
}
