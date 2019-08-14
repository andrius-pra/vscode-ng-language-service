import * as ts from 'typescript/lib/tsserverlibrary';
import * as lsp from 'vscode-languageserver';

function tsDiagnosticCategoryToLspDiagnosticSeverity(category: ts.DiagnosticCategory) {
  switch (category) {
    case ts.DiagnosticCategory.Warning:
      return lsp.DiagnosticSeverity.Warning;
    case ts.DiagnosticCategory.Error:
      return lsp.DiagnosticSeverity.Error;
    case ts.DiagnosticCategory.Suggestion:
      return lsp.DiagnosticSeverity.Hint;
    case ts.DiagnosticCategory.Message:
    default:
      return lsp.DiagnosticSeverity.Information;
  }
}

export function tsDiagnosticToLspDiagnostic(tsDiag: ts.Diagnostic, scriptInfo: ts.server.ScriptInfo): lsp.Diagnostic {
  let start, end;
  if (typeof tsDiag.start === 'number' && typeof tsDiag.length === 'number') {
    start = scriptInfo.positionToLineOffset(tsDiag.start);
    end = scriptInfo.positionToLineOffset(tsDiag.start + tsDiag.length);
  }
  const range = start && end ?
    // lsp is 0 based, vscode is 1 based, so subtract one.
    lsp.Range.create(start.line - 1, start.offset - 1, end.line - 1, end.offset - 1) :
    lsp.Range.create(0, 0, 0, 0);
  return lsp.Diagnostic.create(
    range,
    ts.flattenDiagnosticMessageText(tsDiag.messageText, '\n'),
    tsDiagnosticCategoryToLspDiagnosticSeverity(tsDiag.category),
    tsDiag.code,
    tsDiag.source,
  );
}
