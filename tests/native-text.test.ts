import { it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
it("keeps literal UI text inside native Text components", () => {
  // TableHead forwards its children to React Native Text (components/ui/table.tsx).
  const textComponents = new Set(["Text", "TableHead"]);
  const dir = new URL("../src/ui/", import.meta.url),
    errors: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(new URL(file, dir), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(n: ts.Node) {
      if (
        ts.isJsxElement(n) &&
        !textComponents.has(n.openingElement.tagName.getText(source))
      ) {
        for (const child of n.children) {
          if (
            (ts.isJsxText(child) && child.getText(source).trim()) ||
            (ts.isJsxExpression(child) &&
              child.expression &&
              (ts.isStringLiteralLike(child.expression) ||
                ts.isNumericLiteral(child.expression)))
          ) {
            errors.push(
              `${file}:${source.getLineAndCharacterOfPosition(child.getStart(source)).line + 1} - ${n.openingElement.tagName.getText(source)} contains literal text`,
            );
          }
        }
      }
      ts.forEachChild(n, visit);
    }
    visit(source);
  }
  expect(errors).toEqual([]);
});
