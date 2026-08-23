/**
 * Static audit of every interactive control in the app.
 *
 * Parsed with the TypeScript compiler rather than matched with regexes: JSX
 * nests, attributes hold arbitrary expressions, and a pattern that half-works
 * reports zero findings and reads as a clean bill of health. The first version
 * of this file did exactly that.
 *
 * Checks, per control:
 *   - a button does something (handler, submit type, or spread props)
 *   - a link goes somewhere real (not "#", not empty)
 *   - an icon-only control has an accessible name
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";

// execFile rather than exec: no shell, so nothing here can be interpolated
// into a command line.
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter((f) => f.startsWith("src/") && f.endsWith(".tsx"))
  // The PDF renderer's <Link> and <Text> come from @react-pdf/renderer and are
  // drawing instructions, not DOM. Auditing them for accessible names reports
  // findings that mean nothing.
  .filter((f) => !f.includes("services/export/"));

const findings = [];
const ACTIONS = ["onClick", "onSubmit", "type", "form", "asChild", "disabled", "onChange"];
const NAMES = ["aria-label", "aria-labelledby", "title", "asChild"];

function attrsOf(node) {
  const props = new Map();
  let spread = false;
  for (const attr of node.attributes.properties) {
    if (ts.isJsxSpreadAttribute(attr)) { spread = true; continue; }
    const name = attr.name.getText();
    let value = null;
    if (attr.initializer) {
      value = ts.isStringLiteral(attr.initializer)
        ? attr.initializer.text
        : attr.initializer.getText();
    }
    props.set(name, value);
  }
  return { props, spread };
}

/**
 * Icon components imported from lucide-react in this file.
 *
 * Needed to tell an icon-only control from one whose label is a component. A
 * `<Link><Wordmark /></Link>` renders the product name and is properly named;
 * a `<button><Trash2 /></button>` renders nothing a screen reader can say.
 * Without this distinction the audit reports the first as a defect, and an
 * audit with false positives gets ignored, which is worse than no audit.
 */
function lucideIcons(sf) {
  const names = new Set();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier.getText().includes("lucide-react")) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) names.add(element.name.getText());
    }
  }
  return names;
}

/** Whether the element renders something a screen reader could announce. */
function rendersText(node, icons) {
  if (!node.children) return false;
  let text = false;
  const walk = (n) => {
    if (text) return;
    if (ts.isJsxText(n) && n.getText().trim().length > 1) text = true;
    else if (ts.isJsxExpression(n) && n.expression) {
      // {label}, {children}, {`Sign in`}, {pending ? "…" : "Save"}
      if (n.expression.getText().trim()) text = true;
    } else if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      const tag = n.tagName.getText();
      // A component that is not a known icon may render its own text.
      if (/^[A-Z]/.test(tag) && !icons.has(tag)) text = true;
    }
    n.forEachChild?.(walk);
  };
  node.children.forEach(walk);
  return text;
}

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const icons = lucideIcons(sf);

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();
      const { props, spread } = attrsOf(node);
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const parent = ts.isJsxOpeningElement(node) ? node.parent : node;
      const named = NAMES.some((n) => props.has(n)) || spread;
      const report = (kind) => findings.push({ file, line, kind, tag });

      if (tag === "button" || tag === "Button") {
        if (!ACTIONS.some((a) => props.has(a)) && !spread) report("does nothing: no handler, type or asChild");
        if (!rendersText(parent, icons) && !named) report("icon-only, no accessible name");
      }
      if (tag === "Link" || tag === "a") {
        const href = props.get("href");
        if (href === undefined) report("no href");
        else if (href === "#" || href === "") report("links nowhere");
        if (!rendersText(parent, icons) && !named) report("icon-only, no accessible name");
      }
      if ((tag === "input" || tag === "textarea" || tag === "select") && !named) {
        const id = props.get("id");
        if (!id) report("form control with no id and no aria-label");
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
}

const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);

console.log(`${files.length} files scanned, ${findings.length} findings\n`);
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`── ${kind} (${list.length})`);
  for (const f of list) console.log(`   ${f.file}:${f.line}  <${f.tag}>`);
  console.log();
}

// Non-zero on findings, so `npm run verify` fails rather than printing a
// warning nobody reads.
if (findings.length > 0) process.exit(1);
