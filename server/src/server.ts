/* --------------------------------------------------------------------------------------------
 * Portions Copyright (c) Microsoft Corporation. All rights reserved.
 * Portions Copyright (c) Google Inc. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */



// Force TypeScript to use the non-polling version of the file watchers.
// process.env["TSC_NONPOLLING_WATCHER"] = String(true);

// import * as ng from '@angular/language-service';

// import {
//   createConnection, IConnection, InitializeResult, TextDocumentPositionParams,
//   CompletionItem, CompletionItemKind, Definition, Location, TextDocumentIdentifier,
//   Position, Range, TextEdit, Hover, TextDocuments, TextDocumentSyncKind, DidOpenTextDocumentParams, DidCloseTextDocumentParams, DidChangeTextDocumentParams, DidSaveTextDocumentParams, MarkedString
// } from 'vscode-languageserver';
import * as lsp from 'vscode-languageserver';


// import {uriToFileName} from './documents';
// import {ErrorCollector} from './errors';
// import {Completion} from '@angular/language-service';
import * as tss from 'typescript/lib/tsserverlibrary';
import {Logger} from './logger';
import {ServerHost} from './server_host';
import {ProjectService} from './project_service';
import URI from 'vscode-uri';

// Create a connection for the server. The connection uses Node's IPC as a transport
const connection: lsp.IConnection = lsp.createConnection();
connection.console.log(`TSC_NONPOLLING_WATCHER = ${process.env.TSC_NONPOLLING_WATCHER}`);

// Create a simple text document manager. The text document manager supports
// incremental document sync.
// const documents = new TextDocuments(TextDocumentSyncKind.Incremental);
const tsProjSvcHost = new ServerHost(tss.sys);
connection.console.log(`Current directory: ${tsProjSvcHost.getCurrentDirectory()}`);

const options = new Map<string, string>();
for (let i = 0; i < process.argv.length; ++i) {
	const argv = process.argv[i];
	if (argv === '--logFile') {
		options.set('logFile', process.argv[i + 1]);
	}
}

// const logFile = options.get('logFile')!;
const logFile = '/usr/local/google/home/kyliau/Desktop/nglangsvc.log';
connection.console.log(`Log file: ${logFile}`);

const logger = new Logger(
	logFile,
	false, 	// traceToConsole
	tss.server.LogLevel.verbose,
);

const projSvc = new ProjectService(tsProjSvcHost, logger);
const {tsProjSvc} = projSvc;

if (process.env.NG_DEBUG) {
	logger.info("Angular Language Service is under DEBUG mode");
}


const globalPlugins = tsProjSvc.globalPlugins;
if (!globalPlugins.includes('@angular/language-service')) {
	connection.console.error('Failed to load @angular/language-service');
}

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites.
connection.onInitialize((params): lsp.InitializeResult => {
  return {
    capabilities: {
      // Tell the client that the server works in INCREMENTAL text document sync mode
      textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
      // Tell the client that the server support code complete
      // completionProvider: {
      //   /// The server provides support to resolve additional information for a completion item.
      //   resolveProvider: false,
      //   triggerCharacters: ['<', '.', '*', '[', '(']
      // },
      definitionProvider: true,
      // hoverProvider: true
    }
  }
});

connection.onDidOpenTextDocument((params: lsp.DidOpenTextDocumentParams) => {
	const {textDocument} = params;
	const uri = URI.parse(textDocument.uri);
	if (uri.scheme !== 'file') {	// scheme could be 'untitled'
		return;
	}
	connection.console.log(`OPEN: ${uri.path}`);
	let result: tss.server.OpenConfiguredProjectResult;
	if (uri.path.endsWith(".ts")) {
		result = tsProjSvc.openClientFile(uri.path, textDocument.text, tss.ScriptKind.TS);
	}
	else {
		// connection.console.log(`${uri.path} is not TS file`);
		result = tsProjSvc.openClientFile(uri.path, textDocument.text, tss.ScriptKind.External);
	}
	connection.console.log(JSON.stringify(result, null, 2));

	// if (!result || !result.configFileName) {
	// 	return;
	// }
	// const project = tsProjSvc.findProject(result.configFileName);
	// if (!project) {
	// 	return;
	// }
	// connection.console.log(`FOUND PROJECT: ${project.projectName} ${project.projectKind}`);

  // connection.console.log(params.textDocument.uri);

  // An interersting text document was opened in the client. Inform TypeScirpt's project services about it.
  // const file = uriToFileName(params.textDocument.uri);
  // if (file) {
  //   const { configFileName, configFileErrors } = this.projectService.openClientFile(file, params.textDocument.text);
  //   if (configFileErrors && configFileErrors.length) {
  //     // TODO: Report errors
  //     this.logger.msg(`Config errors encountered and need to be reported: ${configFileErrors.length}\n  ${configFileErrors.map(error => error.messageText).join('\n  ')}`);
  //   }
  //   this.languageIds.set(params.textDocument.uri, params.textDocument.languageId);
  // }
});

connection.onDidCloseTextDocument((params: lsp.DidCloseTextDocumentParams) => {
	const {textDocument} = params;
	const uri = URI.parse(textDocument.uri);
	if (uri.scheme !== 'file') {
		return;
	}
	tsProjSvc.closeClientFile(uri.path);

  // connection.console.log(params.textDocument.uri);
  // const file = uriToFileName(params.textDocument.uri);
  // if (file) {
  //   this.projectService.closeClientFile(file);
  // }
});

connection.onDidChangeTextDocument((params: lsp.DidChangeTextDocumentParams) => {
	// connection.console.log(params.textDocument.uri);
	const {contentChanges, textDocument} = params;
	const uri = URI.parse(textDocument.uri);
	if (uri.scheme !== 'file') {
		return;
	}
	const scriptInfo = tsProjSvc.getScriptInfo(uri.path);
	if (!scriptInfo) {
		connection.console.log(`Failed to get script info for ${uri.path}`);
		return;
	}
	// connection.console.log(JSON.stringify(contentChanges, null, 2));
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
	// const ss = scriptInfo.getSnapshot();
	// connection.console.log(ss.getText(0, ss.getLength()));
  /*
  const file = uriToFileName(params.textDocument.uri);
  if (file) {
    const positions = this.projectService.lineOffsetsToPositions(file,
      ([] as {line: number, col: number}[]).concat(...params.contentChanges.map(change => [{
        // VSCode is 0 based, editor services is 1 based.
        line: change.range.start.line + 1,
        col: change.range.start.character + 1
      }, {
        line: change.range.end.line + 1,
        col: change.range.end.character + 1
      }])));
    if (positions) {
      // this.changeNumber++;
      const mappedChanges = params.contentChanges.map((change, i) => {
        const start = positions[i * 2];
        const end = positions[i * 2 + 1];
        return {start, end, insertText: change.text};
      });
      this.projectService.clientFileChanges(file, mappedChanges);
      // this.changeNumber++;
    }
  }
  */
});

connection.onDidSaveTextDocument((params: lsp.DidSaveTextDocumentParams) => {
	// connection.console.log(params.textDocument.uri);
	const {text, textDocument} = params;
	const uri = URI.parse(textDocument.uri);
	if (uri.scheme !== 'file') {
		return;
	}
	const scriptInfo = tsProjSvc.getScriptInfo(uri.path);
	if (!scriptInfo) {
		return;
	}
	if (text) {
		scriptInfo.open(text);
	}
	else {
		scriptInfo.reloadFromFile();
	}


  // If the file is saved, force the content to be reloaded from disk as the content might have changed on save.
  // this.changeNumber++;
  /*
  const file = uriToFileName(params.textDocument.uri);
  if (file) {
    const savedContent = this.host.readFile(file);
    this.projectService.closeClientFile(file);
    this.projectService.openClientFile(file, savedContent);
    // this.changeNumber++;
  }
  */
});



connection.onDefinition((params: lsp.TextDocumentPositionParams) => {
	const {position, textDocument} = params;
	const uri = URI.parse(textDocument.uri);
	if (uri.scheme !== 'file') {
		return;
	}
	const scriptInfo = tsProjSvc.getScriptInfo(uri.path);
	if (!scriptInfo) {
		connection.console.log(`Script info not found for ${uri.path}`);
		return;
	}
	connection.console.log(scriptInfo.containingProjects.map(p => p.projectName).join(", "));

	const {fileName} = scriptInfo;
	let project = tsProjSvc.getDefaultProjectForFile(fileName, true /* ensureProject */);

	if (!project) {
		return;
	}


	// if (!project || project.projectKind !== tss.server.ProjectKind.Configured) {
	// 	project = projSvc.getProjectForTemplate(uri.path);
	// 	if (!project) {
	// 		connection.console.log(`${fileName} does not belong in any project`);
	// 		return;
	// 	}
	// 	scriptInfo.detachAllProjects();
	// 	scriptInfo.attachToProject(project);

	// 	if (!project.containsScriptInfo(scriptInfo)) {
	// 		connection.console.log(`Project does not contain ${scriptInfo.fileName}`);
	// 		project.addRoot(scriptInfo);
	// 		project.markAsDirty();
	// 	}
	// }

	const offset = scriptInfo.lineOffsetToPosition(position.line + 1, position.character + 1);
	const tsLangSvc = project.getLanguageService();
	const definition = tsLangSvc.getDefinitionAndBoundSpan(fileName, offset);
	if (!definition || !definition.definitions) {
		return;
	}
	connection.console.log(JSON.stringify(definition, null, 2));
	const results: lsp.Location[] = [];
	for (const d of definition.definitions) {
		const scriptInfo = tsProjSvc.getScriptInfo(d.fileName);
		if (!scriptInfo) {
			continue;
		}
		const uri = URI.from({
			scheme: 'file',
			path: d.fileName,
		});
		const startLoc = scriptInfo.positionToLineOffset(d.textSpan.start);
		const endLoc = scriptInfo.positionToLineOffset(d.textSpan.start + d.textSpan.length);
		const range = lsp.Range.create(
			// ScriptInfo is 1-based, LSP is 0-based
			lsp.Position.create(startLoc.line - 1, startLoc.offset - 1),
			lsp.Position.create(endLoc.line - 1, endLoc.offset - 1),
		);
		results.push(lsp.Location.create(uri.toString(), range));
	}

	// connection.console.log(JSON.stringify(results, null, 2));

	return results;

	// return [];
  // const {fileName, service, offset, languageId} = documents.getServiceInfo(textDocumentPosition.textDocument,
  //   textDocumentPosition.position)
  // if (fileName && service && offset != null) {
  //   let result = service.getDefinitionAt(fileName, offset);
  //   if (result) {
  //     return ngDefintionToDefintion(result);
  //   }
  // }
});


connection.onHover((params: lsp.TextDocumentPositionParams) => {
	const {position, textDocument} = params;
	const uri = URI.parse(textDocument.uri);
	if (uri.scheme !== 'file') {
		return;
	}
	const scriptInfo = tsProjSvc.getScriptInfo(uri.path);
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
	// connection.console.log(JSON.stringify(info, null, 2));
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

  // const {fileName, service, offset, languageId} = documents.getServiceInfo(textDocumentPosition.textDocument,
  //   textDocumentPosition.position)
  // if (fileName && service && offset != null) {
  //   let result = service.getHoverAt(fileName, offset);
  //   if (result) {
  //     return ngHoverToHover(result, textDocumentPosition.textDocument);
  //   }
  // }
});

/*
// This handler provides the initial list of the completion items.
connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
  const {fileName, service, offset, languageId} = documents.getServiceInfo(textDocumentPosition.textDocument,
    textDocumentPosition.position)
  if (fileName && service && offset != null) {
    let result = service.getCompletionsAt(fileName, offset);
    if (result && languageId == 'html') {
      // The HTML elements are provided by the HTML service when the text type is 'html'.
      result = result.filter(completion => completion.kind != 'element');
    }
    if (result) {
      const replaceRange = getReplaceRange(textDocumentPosition.textDocument, offset);
      return result.map(completion => ({
        label: completion.name,
        kind: compiletionKindToCompletionItemKind(completion.kind),
        detail: completion.kind,
        sortText: completion.sort,
        textEdit: insertionToEdit(replaceRange, insertTextOf(completion)),
        insertText: insertTextOf(completion)
      }));
    }
  }
});
*/

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
