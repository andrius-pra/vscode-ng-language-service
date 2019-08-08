/* --------------------------------------------------------------------------------------------
 * Portions Copyright (c) Microsoft Corporation. All rights reserved.
 * Portions Copyright (c) Google Inc. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as lsp from 'vscode-languageserver';
import * as tss from 'typescript/lib/tsserverlibrary';
import {createLogger} from './logger';
import {ServerHost} from './server_host';
import {ProjectService} from './project_service';
import {uriToFilePath, filePathToUri} from './utils';
import {tsCompletionEntryToLspCompletionItem} from './completion';
import {tsDiagnosticToLspDiagnostic} from './diagnostic';

// Create a connection for the server. The connection uses Node's IPC as a transport
const connection: lsp.IConnection = lsp.createConnection();
const serverHost = new ServerHost(tss.sys);

const options = new Map<string, string>();
for (let i = 0; i < process.argv.length; ++i) {
	const argv = process.argv[i];
	if (argv === '--logFile') {
		options.set('logFile', process.argv[i + 1]);
	}
	if (argv === '--logVerbosity') {
		options.set('logVerbosity', process.argv[i + 1]);
	}
}

// logger logs to file. OK to emit verbose entries.
const logger = createLogger(options);
connection.console.info(`Log file: ${logger.getLogFileName()}`);

// Our ProjectService is just a thin wrapper around TS's ProjectService

// const {tsProjSvc} = projSvc;

if (process.env.NG_DEBUG) {
	logger.info("Angular Language Service is under DEBUG mode");
}
const pluginProbeLocation = serverHost.getCurrentDirectory();
connection.console.info(`Launching @angular/language-service from ${pluginProbeLocation}`);

if (process.env.TSC_NONPOLLING_WATCHER !== 'true') {
	connection.console.warn(`Using less efficient polling watcher. Set TSC_NONPOLLING_WATCHER to true.`);
}

const tsProjSvc = new tss.server.ProjectService({
	host: serverHost,
	logger,
	cancellationToken: tss.server.nullCancellationToken,
	useSingleInferredProject: true,
	useInferredProjectPerProjectRoot: true,
	typingsInstaller: tss.server.nullTypingsInstaller,
	suppressDiagnosticEvents: false,
	eventHandler: handleProjectServiceEvent,
	globalPlugins: ['@angular/language-service'],
	pluginProbeLocations: [pluginProbeLocation],
	allowLocalPluginLoads: false,	// do not load plugins from tsconfig.json
	// allowLocalPluginLoads: true,
});

const projSvc = new ProjectService(tsProjSvc);

const globalPlugins = tsProjSvc.globalPlugins;
if (globalPlugins.includes('@angular/language-service')) {
	console.info('Success: @angular/language-service loaded');
}
else {
	console.error('Failed to load @angular/language-service');
}

function handleProjectServiceEvent(event: tss.server.ProjectServiceEvent) {
	connection.console.info(`Event: ${event.eventName}`);
	if (event.eventName !== tss.server.ProjectsUpdatedInBackgroundEvent) {
		return;
	}
	const {openFiles} = event.data;
	for (const fileName of openFiles) {
		const scriptInfo = tsProjSvc.getScriptInfo(fileName);
		if (!scriptInfo) {
			continue;
		}
		const project = projSvc.getDefaultProjectForScriptInfo(scriptInfo);
		if (!project) {
			continue;
		}
		const ngLS = project.getLanguageService();
		const diagnostics = ngLS.getSemanticDiagnostics(fileName);
		// Need to send diagnostics even if it's empty otherwise editor state will
		// not be updated.
		connection.sendDiagnostics({
			uri: filePathToUri(fileName),
			diagnostics: diagnostics.map(d => tsDiagnosticToLspDiagnostic(d, scriptInfo)),
		});
	}
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

	const scriptInfo = tsProjSvc.getScriptInfo(filePath);
	// scriptInfo.default

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

	// TODO: enable when language service handles HTML files
	// project.refreshDiagnostics();
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

	const project = scriptInfo.getDefaultProject();
	project.refreshDiagnostics();
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
	const langSvc = project.getLanguageService();
	const definition = langSvc.getDefinitionAndBoundSpan(fileName, offset);
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
		// ScriptInfo is 1-based, LSP is 0-based
		const range = lsp.Range.create(
			startLoc.line - 1, startLoc.offset - 1,
			endLoc.line - 1, endLoc.offset - 1,
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
	const langSvc = project.getLanguageService();
	const info = langSvc.getQuickInfoAtPosition(fileName, offset);
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
			startLoc.line - 1, startLoc.offset - 1,
			endLoc.line - 1, endLoc.offset - 1
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
	const langSvc = project.getLanguageService();
	const completions = langSvc.getCompletionsAtPosition(filePath, offset, {
		// options
	});
	if (!completions || !completions.entries.length) {
		return;
	}
	return completions.entries.map((e) => tsCompletionEntryToLspCompletionItem(e, position));
});

connection.listen();
