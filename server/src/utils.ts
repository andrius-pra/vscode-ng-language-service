import {URI} from 'vscode-uri';
import * as lsp from 'vscode-languageserver';
import * as path from 'path';

enum Scheme {
  File = 'file',
};

export function uriToFilePath(uri: string): string {
  const {scheme, fsPath} = URI.parse(uri);
  if (scheme !== Scheme.File) {
    return '';
  }

  return fsPath.replace(new RegExp('\\' + path.sep, 'g'), '/');
}

export function filePathToUri(filePath: string): string {
  return URI.from({
    scheme: Scheme.File,
    path: filePath,
  }).toString();
}

export function tsTextSpanToLspRange(scriptInfo: ts.server.ScriptInfo, textSpan: ts.TextSpan) {
	const start = scriptInfo.positionToLineOffset(textSpan.start);
	const end = scriptInfo.positionToLineOffset(textSpan.start + textSpan.length);
	// ScriptInfo (TS) is 1-based, LSP is 0-based.
	return lsp.Range.create(
		start.line - 1, start.offset - 1, end.line - 1, end.offset - 1);
}

export function lspPositionToTsPosition(scriptInfo: ts.server.ScriptInfo, position: lsp.Position) {
	const {line, character} = position;
	// ScriptInfo (TS) is 1-based, LSP is 0-based.
	return scriptInfo.lineOffsetToPosition(line + 1, character + 1);
}

export function lspRangeToTsPositions(scriptInfo: ts.server.ScriptInfo, range: lsp.Range): [number, number] {
	const start = lspPositionToTsPosition(scriptInfo, range.start);
	const end = lspPositionToTsPosition(scriptInfo, range.end);
	return [start, end];
}
