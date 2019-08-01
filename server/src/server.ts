/* --------------------------------------------------------------------------------------------
 * Portions Copyright (c) Microsoft Corporation. All rights reserved.
 * Portions Copyright (c) Google Inc. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as lsp from 'vscode-languageserver';
import * as tss from 'typescript/lib/tsserverlibrary';
import {Logger} from './logger';
import {ServerHost} from './server_host';
import {ProjectService} from './project_service';
import {uriToFilePath, filePathToUri} from './utils';

// Create a connection for the server. The connection uses Node's IPC as a transport
const connection: lsp.IConnection = lsp.createConnection();

const tsProjSvcHost = new ServerHost(tss.sys);

const options = new Map<string, string>();
for (let i = 0; i < process.argv.length; ++i) {
	const argv = process.argv[i];
	if (argv === '--logFile') {
		options.set('logFile', process.argv[i + 1]);
	}
}

// connection.console logs to vscode development console. DO NOT write verbose
// logs to the console!
const logFile = options.get('logFile')!;
// const logFile = '/usr/local/google/home/kyliau/Desktop/nglangsvc.log';
connection.console.info(`Log file: ${logFile}`);

// logger logs to file. OK to emit verbose entries.
const logger = new Logger(
	logFile,
	false, 	// traceToConsole
	tss.server.LogLevel.verbose,
);

// Our ProjectService is just a thin wrapper around TS's ProjectService
const projSvc = new ProjectService(tsProjSvcHost, logger, connection.console);
const {tsProjSvc} = projSvc;

if (process.env.NG_DEBUG) {
	logger.info("Angular Language Service is under DEBUG mode");
}

// After the server has started the client sends an initilize request.
connection.onInitialize((params): lsp.InitializeResult => {
  return {
    capabilities: {
      // Tell the client that the server works in INCREMENTAL text document sync mode
      textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
      // Tell the client that the server support code complete
      completionProvider: {
        /// The server provides support to resolve additional information for a completion item.
        resolveProvider: false,
        triggerCharacters: ['<', '.', '*', '[', '(']
      },
      definitionProvider: true,
      hoverProvider: true,
    }
  }
});

connection.onDidOpenTextDocument((params: lsp.DidOpenTextDocumentParams) => {
	const {textDocument} = params;
	const filePath = uriToFilePath(textDocument.uri);
	if (!filePath) {
		return;
	}
	connection.console.info(`OPEN: ${filePath}`);
	const scriptKind = filePath.endsWith('.ts') ? tss.ScriptKind.TS : tss.ScriptKind.External;
	const result = tsProjSvc.openClientFile(filePath, textDocument.text, scriptKind);

	const {configFileName, configFileErrors} = result;
	if (configFileErrors && configFileErrors.length) {
		connection.console.error(configFileErrors.map(e => e.messageText).join('\n'));
	}
	if (!configFileName) {
		return;
	}
	const project = tsProjSvc.findProject(configFileName);
	if (!project) {
		connection.console.error(`Failed to find project for ${filePath}`);
		return;
	}
	// Must mark project as dirty to rebuild the program.
	project.markAsDirty();
});

connection.onDidCloseTextDocument((params: lsp.DidCloseTextDocumentParams) => {
	const {textDocument} = params;
	const filePath = uriToFilePath(textDocument.uri);
	if (!filePath) {
		return;
	}
	tsProjSvc.closeClientFile(filePath);
});

connection.onDidChangeTextDocument((params: lsp.DidChangeTextDocumentParams) => {
	const {contentChanges, textDocument} = params;
	const filePath = uriToFilePath(textDocument.uri);
	if (!filePath) {
		return;
	}
	const scriptInfo = tsProjSvc.getScriptInfo(filePath);
	if (!scriptInfo) {
		connection.console.log(`Failed to get script info for ${filePath}`);
		return;
	}
	for (const change of contentChanges) {
		if (change.range) {
			const {line: startLine, character: startOffset} = change.range.start;
			// ScriptInfo is 1-based, LSP is 0-based
			const start = scriptInfo.lineOffsetToPosition(startLine + 1, startOffset + 1);
			const {line: endLine, character: endOffset} = change.range.end;
			const end = scriptInfo.lineOffsetToPosition(endLine + 1, endOffset + 1);
			scriptInfo.editContent(start, end, change.text);
		}
	}
});

connection.onDidSaveTextDocument((params: lsp.DidSaveTextDocumentParams) => {
	const {text, textDocument} = params;
	const filePath = uriToFilePath(textDocument.uri);
	const scriptInfo = tsProjSvc.getScriptInfo(filePath);
	if (!scriptInfo) {
		return;
	}
	if (text) {
		scriptInfo.open(text);
	}
	else {
		scriptInfo.reloadFromFile();
	}
});



connection.onDefinition((params: lsp.TextDocumentPositionParams) => {
	const {position, textDocument} = params;
	const filePath = uriToFilePath(textDocument.uri);
	const scriptInfo = tsProjSvc.getScriptInfo(filePath);
	if (!scriptInfo) {
		connection.console.log(`Script info not found for ${filePath}`);
		return;
	}

	const {fileName} = scriptInfo;
	const project = projSvc.getDefaultProjectForScriptInfo(scriptInfo);
	if (!project) {
		return;
	}

	const offset = scriptInfo.lineOffsetToPosition(position.line + 1, position.character + 1);
	const tsLangSvc = project.getLanguageService();
	const definition = tsLangSvc.getDefinitionAndBoundSpan(fileName, offset);
	if (!definition || !definition.definitions) {
		return;
	}
	const results: lsp.Location[] = [];
	for (const d of definition.definitions) {
		const scriptInfo = tsProjSvc.getScriptInfo(d.fileName);
		if (!scriptInfo) {
			continue;
		}
		const startLoc = scriptInfo.positionToLineOffset(d.textSpan.start);
		const endLoc = scriptInfo.positionToLineOffset(d.textSpan.start + d.textSpan.length);
		const range = lsp.Range.create(
			// ScriptInfo is 1-based, LSP is 0-based
			lsp.Position.create(startLoc.line - 1, startLoc.offset - 1),
			lsp.Position.create(endLoc.line - 1, endLoc.offset - 1),
		);
		results.push(lsp.Location.create(filePathToUri(d.fileName), range));
	}
	return results;
});


connection.onHover((params: lsp.TextDocumentPositionParams) => {
	const {position, textDocument} = params;
	const filePath = uriToFilePath(textDocument.uri);
	if (!filePath) {
		return;
	}
	const scriptInfo = tsProjSvc.getScriptInfo(filePath);
	if (!scriptInfo) {
		return;
	}
	const {fileName} = scriptInfo;
	const project = tsProjSvc.getDefaultProjectForFile(fileName, true /* ensureProject */);
	if (!project) {
		return;
	}
	const offset = scriptInfo.lineOffsetToPosition(position.line + 1, position.character + 1);
	const tsLangSvc = project.getLanguageService();
	const info = tsLangSvc.getQuickInfoAtPosition(fileName, offset);
	if (!info) {
		return;
	}
	const {kind, kindModifiers, textSpan, displayParts, documentation} = info;
	let desc = kindModifiers ? kindModifiers + ' ' : '';
	if (displayParts) {
		// displayParts does not contain info about kindModifiers
		// but displayParts does contain info about kind
		desc += displayParts.map(dp => dp.text).join('');
	}
	else {
		desc += kind;
	}
	const contents: lsp.MarkedString[] = [{
		language: 'typescript',
		value: desc,
	}];
	if (documentation) {
		for (const d of documentation) {
			contents.push(d.text);
		}
	}
	const startLoc = scriptInfo.positionToLineOffset(textSpan.start);
	const endLoc = scriptInfo.positionToLineOffset(textSpan.start + textSpan.length);
	return {
		contents,
		range: lsp.Range.create(
			lsp.Position.create(startLoc.line - 1, startLoc.offset - 1),
			lsp.Position.create(endLoc.line - 1, endLoc.offset - 1),
		),
	};
});

// This handler provides the initial list of the completion items.
connection.onCompletion((params: lsp.CompletionParams) => {
	const {position, textDocument} = params;
	const filePath = uriToFilePath(textDocument.uri);
	if (!filePath) {
		return;
	}
	const scriptInfo = tsProjSvc.getScriptInfo(filePath);
	if (!scriptInfo) {
		return;
	}
	const project = projSvc.getDefaultProjectForScriptInfo(scriptInfo);
	if (!project) {
		return;
	}
	const offset = scriptInfo.lineOffsetToPosition(position.line + 1, position.character + 1);
	const tsLangSvc = project.getLanguageService();
	const completions = tsLangSvc.getCompletionsAtPosition(filePath, offset, {
		// options
	});
	if (!completions || !completions.entries.length) {
		return;
	}

	return completions.entries.map((entry) => {
		return {
			label: entry.name,
			kind: compiletionKindToCompletionItemKind(entry.kind),
			detail: entry.kind,
			sortText: entry.sortText,
			textEdit: {
				range: lsp.Range.create(position, position),
				newText: entry.name,
			},
		};
	});

	// kind is actually tss.ScriptElementKind
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

	// function insertTextOf(completion: Completion): string {
	// 	switch (completion.kind) {
	// 		case 'attribute':
	// 		case 'html attribute':
	// 			return `${completion.name}=`;
	// 	}
	// 	return completion.name;
	// }

});

// Listen on the connection
connection.listen();

// Setup the error collector that watches for document events and requests errors
// reported back to the client
// const errorCollector = new ErrorCollector(documents, connection);

// function handleTextEvent(event: TextDocumentEvent) {
//   switch (event.kind) {
//     case 'context':
//     case 'change':
//     case 'opened':
//       errorCollector.requestErrors(event.document);
//   }
// }

// Make the text document manager listen on the connection
// for open, change and close text document events
// documents.listen(connection);

/*
function compiletionKindToCompletionItemKind(kind: string): CompletionItemKind {
  switch (kind) {
  case 'attribute': return CompletionItemKind.Property;
  case 'html attribute': return CompletionItemKind.Property;
  case 'component': return CompletionItemKind.Class;
  case 'element': return CompletionItemKind.Class;
  case 'entity': return CompletionItemKind.Text;
  case 'key': return CompletionItemKind.Class;
  case 'method': return CompletionItemKind.Method;
  case 'pipe': return CompletionItemKind.Function;
  case 'property': return CompletionItemKind.Property;
  case 'type': return CompletionItemKind.Interface;
  case 'reference': return CompletionItemKind.Variable;
  case 'variable': return CompletionItemKind.Variable;
  }
  return CompletionItemKind.Text;
}

const wordRe = /(\w|\(|\)|\[|\]|\*|\-|\_|\.)+/g;
const special = /\(|\)|\[|\]|\*|\-|\_|\./;

// Convert attribute names with non-\w chracters into a text edit.
function insertionToEdit(range: Range, insertText: string): TextEdit {
  if (insertText.match(special) && range) {
    return TextEdit.replace(range, insertText);
  }
}

function getReplaceRange(document: TextDocumentIdentifier, offset: number): Range {
  const line = documents.getDocumentLine(document, offset);
  if (line && line.text && line.start <= offset && line.start + line.text.length >= offset) {
    const lineOffset = offset - line.start - 1;

    // Find the word that contains the offset
    let found: number, len: number;
    line.text.replace(wordRe, <any>((word: string, _: string, wordOffset: number) => {
      if (wordOffset <= lineOffset && wordOffset + word.length >= lineOffset && word.match(special)) {
        found = wordOffset;
        len = word.length;
      }
    }));
    if (found != null) {
      return Range.create(Position.create(line.line - 1, found), Position.create(line.line - 1, found + len));
    }
  }
}

function insertTextOf(completion: Completion): string {
  switch (completion.kind) {
    case 'attribute':
    case 'html attribute':
      return `${completion.name}=`;
  }
  return completion.name;
}

function ngDefintionToDefintion(definition: ng.Definition): Definition {
  const locations = definition.map(d => {
    const document = TextDocumentIdentifier.create(fileNameToUri(d.fileName));
    const positions = documents.offsetsToPositions(document, [d.span.start, d.span.end]);
    return {document, positions}
  }).filter(d => d.positions.length > 0).map(d => {
    const range = Range.create(d.positions[0], d.positions[1]);
    return Location.create(d.document.uri, range);
  });
  if (locations && locations.length) {
    return locations;
  }
}

function logErrors<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e.message && e.stack) connection.console.error(`SERVER ERROR: ${e.message}\n${e.stack}`);
    throw e;
  }
}

function ngHoverToHover(hover: ng.Hover, document: TextDocumentIdentifier): Hover {
  if (hover) {
    const positions = documents.offsetsToPositions(document, [hover.span.start, hover.span.end]);
    if (positions) {
      const range = Range.create(positions[0], positions[1]);
      return {
        contents: {language: 'typescript', value: hover.text.map(t => t.text).join('')},
        range
      };
    }
  }
}
*/
