import * as ts from 'typescript/lib/tsserverlibrary';
import * as lsp from 'vscode-languageserver';

// kind is actually ts.ScriptElementKind
function compiletionKindToCompletionItemKind(kind: string): lsp.CompletionItemKind {
  switch (kind) {
  case 'attribute': return lsp.CompletionItemKind.Property;
  case 'html attribute': return lsp.CompletionItemKind.Property;
  case 'component': return lsp.CompletionItemKind.Class;
  case 'element': return lsp.CompletionItemKind.Class;
  case 'entity': return lsp.CompletionItemKind.Text;
  case 'key': return lsp.CompletionItemKind.Class;
  case 'method': return lsp.CompletionItemKind.Method;
  case 'pipe': return lsp.CompletionItemKind.Function;
  case 'property': return lsp.CompletionItemKind.Property;
  case 'type': return lsp.CompletionItemKind.Interface;
  case 'reference': return lsp.CompletionItemKind.Variable;
  case 'variable': return lsp.CompletionItemKind.Variable;
  }
  return lsp.CompletionItemKind.Text;
}

export function tsCompletionEntryToLspCompletionItem(
  entry: ts.CompletionEntry,
  position: lsp.Position,
): lsp.CompletionItem {
  const item = lsp.CompletionItem.create(entry.name);
  item.kind = compiletionKindToCompletionItemKind(entry.kind);
  item.detail = entry.kind;
  item.sortText = entry.sortText;
  item.textEdit = lsp.TextEdit.insert(position, entry.name);
  return item;
}
