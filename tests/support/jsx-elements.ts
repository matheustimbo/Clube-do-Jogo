import { readFileSync } from 'node:fs';
import ts from 'typescript';

export type JsxElementInfo = {
  /** O nome da tag como está no código: `Sheet`, `Dialog.Content`, `div`. */
  tag: string;
  /** O código do elemento inteiro, da abertura ao fechamento. */
  text: string;
  /** O texto do atributo como está no código (`"Filtros"`, `{title}`), ou undefined sem ele. */
  attribute(name: string): string | undefined;
  /** Se `tag` aparece dentro do elemento, nos filhos ou nas props (`footer={<X />}`). */
  renders(tag: string): boolean;
};

function tagOf(node: ts.Node): string | null {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText();
  return null;
}

function attributesOf(node: ts.JsxElement | ts.JsxSelfClosingElement) {
  return (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties;
}

/** Cada elemento JSX do arquivo cuja tag está em `tags`, lido pelo parser do TypeScript. */
export function jsxElements(file: string, tags: string[]): JsxElementInfo[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: JsxElementInfo[] = [];
  const visit = (node: ts.Node) => {
    const tag = tagOf(node);
    if (tag && tags.includes(tag)) {
      const element = node as ts.JsxElement | ts.JsxSelfClosingElement;
      found.push({
        tag,
        text: node.getText(),
        attribute: name => attributesOf(element)
          .filter(ts.isJsxAttribute)
          .find(property => property.name.getText() === name)
          ?.initializer?.getText(),
        renders: inner => {
          let hit = false;
          const search = (child: ts.Node) => {
            if (hit) return;
            if (child !== node && tagOf(child) === inner) hit = true;
            else ts.forEachChild(child, search);
          };
          search(node);
          return hit;
        },
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
