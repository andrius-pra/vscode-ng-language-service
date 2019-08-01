import * as tss from 'typescript/lib/tsserverlibrary';
import * as lsp from 'vscode-languageserver';

export function tsDiagnosticToLspDiagnostic(tsDiag: tss.Diagnostic, scriptInfo: tss.server.ScriptInfo): lsp.Diagnostic {
	let start, end;
	if (typeof tsDiag.start === 'number' && typeof tsDiag.length === 'number') {
		start = scriptInfo.positionToLineOffset(tsDiag.start);
		end = scriptInfo.positionToLineOffset(tsDiag.start + tsDiag.length);
	}
	const range = start && end ?
		lsp.Range.create(start.line - 1, start.offset - 1, end.line - 1, end.offset - 1) :
		lsp.Range.create(0, 0, 0, 0);
	let severity: lsp.DiagnosticSeverity;
	switch (tsDiag.category) {
		case tss.DiagnosticCategory.Warning:
			severity = lsp.DiagnosticSeverity.Warning;
			break;
		case tss.DiagnosticCategory.Error:
			severity = lsp.DiagnosticSeverity.Error;
			break;
		case tss.DiagnosticCategory.Suggestion:
			severity = lsp.DiagnosticSeverity.Hint;
			break;
		case tss.DiagnosticCategory.Message:
		default:
			severity = lsp.DiagnosticSeverity.Information;
			break;
	}
	return lsp.Diagnostic.create(
		range,
		tsDiag.messageText as string,
		severity,
		tsDiag.code,
		tsDiag.source,
	);
}
