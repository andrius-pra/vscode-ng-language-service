/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as ts from 'typescript/lib/tsserverlibrary';
import * as lsp from 'vscode-languageserver';
import {ConfigurationParams, ConfigurationRequest, Disposable, DocumentHighlightKind, DocumentRangeFormattingRequest, DocumentSelector, TextDocument} from 'vscode-languageserver';

import {tsCompletionEntryDetailsToLspCompletionItem, tsCompletionEntryToLspCompletionItem} from './completion';
import {tsDiagnosticToLspDiagnostic} from './diagnostic';
import {Logger} from './logger';
import {ProjectService} from './project_service';
import {projectLoadingNotification} from './protocol';
import {ServerHost} from './server_host';
import {filePathToUri, lspPositionToTsPosition, lspRangeToTsPositions, tsTextSpanToLspRange, uriToFilePath} from './utils';

export interface SessionOptions {
  host: ServerHost;
  logger: Logger;
  ngProbeLocation: string;
}

enum LanguageId {
  TS = 'typescript',
  HTML = 'html',
}

// Empty definition range for files without `scriptInfo`
const EMPTY_RANGE = lsp.Range.create(0, 0, 0, 0);
class Settings {
  html: any;
  css: any;
};
/**
 * Session is a wrapper around lsp.IConnection, with all the necessary protocol
 * handlers installed for Angular language service.
 */
export class Session {
  private readonly connection: lsp.IConnection;
  private readonly projectService: ProjectService;
  private diagnosticsTimeout: NodeJS.Timeout|null = null;
  private isProjectLoading = false;
  private scopedSettingsSupport = false;
  private globalSettings: Settings = {css: {}, html: {}};
  private documentSettings: {[key: string]: Thenable<Settings>} = {};
  private dynamicFormatterRegistration = false;
  private formatterRegistration: Promise<Disposable>|null = null;
  private clientSnippetSupport = false;
  constructor(options: SessionOptions) {
    // Create a connection for the server. The connection uses Node's IPC as a transport.
    this.connection = lsp.createConnection();
    this.addProtocolHandlers(this.connection);
    this.projectService = new ProjectService({
      host: options.host,
      logger: options.logger,
      cancellationToken: ts.server.nullCancellationToken,
      useSingleInferredProject: true,
      useInferredProjectPerProjectRoot: true,
      typingsInstaller: ts.server.nullTypingsInstaller,
      suppressDiagnosticEvents: false,
      eventHandler: (e) => this.handleProjectServiceEvent(e),
      globalPlugins: ['@angular/language-service', '@angular/embedded-language-services'],
      pluginProbeLocations: [options.ngProbeLocation],
      allowLocalPluginLoads: false,  // do not load plugins from tsconfig.json
    });
  }

  private addProtocolHandlers(conn: lsp.IConnection) {
    conn.onInitialize(p => this.onInitialize(p));
    conn.onDidOpenTextDocument(p => this.onDidOpenTextDocument(p));
    conn.onDidCloseTextDocument(p => this.onDidCloseTextDocument(p));
    conn.onDidChangeTextDocument(p => this.onDidChangeTextDocument(p));
    conn.onDidSaveTextDocument(p => this.onDidSaveTextDocument(p));
    conn.onDefinition(p => this.onDefinition(p));
    conn.onHover(p => this.onHover(p));
    conn.onCompletion(p => this.onCompletion(p));
    conn.onCompletionResolve(p => this.onCompletionResolve(p));
    conn.onDocumentHighlight(p => this.onDocumentHighlight(p));
    conn.onDocumentFormatting(p => this.onDocumentFormatting(p));
    conn.onDocumentRangeFormatting(p => this.onDocumentRangeFormatting(p));
    conn.onFoldingRanges(p => this.onFoldingRanges(p));
    conn.onDidChangeConfiguration(p => this.onDidChangeConfiguration(p));
  }

  /**
   * An event handler that gets invoked whenever the program changes and
   * TS ProjectService sends `ProjectUpdatedInBackgroundEvent`. This particular
   * event is used to trigger diagnostic checks.
   * @param event
   */
  private handleProjectServiceEvent(event: ts.server.ProjectServiceEvent) {
    switch (event.eventName) {
      case ts.server.ProjectLoadingStartEvent:
        this.isProjectLoading = true;
        this.connection.sendNotification(projectLoadingNotification.start);
        break;
      case ts.server.ProjectLoadingFinishEvent: {
        const {project} = event.data;
        // Disable language service if project is not Angular
        this.checkIsAngularProject(project);
        if (this.isProjectLoading) {
          this.isProjectLoading = false;
          this.connection.sendNotification(projectLoadingNotification.finish);
        }
        break;
      }
      case ts.server.ProjectsUpdatedInBackgroundEvent:
        // ProjectsUpdatedInBackgroundEvent is sent whenever diagnostics are
        // requested via project.refreshDiagnostics()
        this.triggerDiagnostics(event.data.openFiles);
        break;
    }
  }

  /**
   * Retrieve Angular diagnostics for the specified `openFiles` after a specific
   * `delay`, or renew the request if there's already a pending one.
   * @param openFiles
   * @param delay time to wait before sending request (milliseconds)
   */
  private triggerDiagnostics(openFiles: string[], delay: number = 200) {
    // Do not immediately send a diagnostics request. Send only after user has
    // stopped typing after the specified delay.
    if (this.diagnosticsTimeout) {
      // If there's an existing timeout, cancel it
      clearTimeout(this.diagnosticsTimeout);
    }
    // Set a new timeout
    this.diagnosticsTimeout = setTimeout(() => {
      this.diagnosticsTimeout = null;  // clear the timeout
      this.sendPendingDiagnostics(openFiles);
      // Default delay is 200ms, consistent with TypeScript. See
      // https://github.com/microsoft/vscode/blob/7b944a16f52843b44cede123dd43ae36c0405dfd/extensions/typescript-language-features/src/features/bufferSyncSupport.ts#L493)
    }, delay);
  }

  /**
   * Execute diagnostics request for each of the specified `openFiles`.
   * @param openFiles
   */
  private sendPendingDiagnostics(openFiles: string[]) {
    for (const fileName of openFiles) {
      const scriptInfo = this.projectService.getScriptInfo(fileName);
      if (!scriptInfo) {
        continue;
      }

      const ngLS = this.projectService.getDefaultLanguageService(scriptInfo);
      if (!ngLS) {
        continue;
      }

      const diagnostics = ngLS.getSemanticDiagnostics(fileName);
      // Need to send diagnostics even if it's empty otherwise editor state will
      // not be updated.
      this.connection.sendDiagnostics({
        uri: filePathToUri(fileName),
        diagnostics: diagnostics.map(d => tsDiagnosticToLspDiagnostic(d, scriptInfo)),
      });
    }
  }

  private getClientCapability<T>(params: lsp.InitializeParams, name: string, def: T) {
    const keys = name.split('.');
    let c: any = params.capabilities;
    for (let i = 0; c && i < keys.length; i++) {
      if (!c.hasOwnProperty(keys[i])) {
        return def;
      }
      c = c[keys[i]];
    }
    return c;
  }

  private onInitialize(params: lsp.InitializeParams): lsp.InitializeResult {
    this.clientSnippetSupport = this.getClientCapability(
        params, 'textDocument.completion.completionItem.snippetSupport', false);
    this.dynamicFormatterRegistration =
        this.getClientCapability(params, 'textDocument.rangeFormatting.dynamicRegistration', false);
    // this.getClientCapability(
    //     params, 'textDocument.rangeFormatting.dynamicRegistration', false) &&
    // (typeof params.initializationOptions.provideFormatter !== 'boolean');
    this.scopedSettingsSupport = this.getClientCapability(params, 'workspace.configuration', false);
    return {
      capabilities: {
        textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
        completionProvider: {
          // The server does not provide support to resolve additional information
          // for a completion item.
          resolveProvider: true,
          triggerCharacters:
              ['<', '.', '*', '[', '(', '$', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
        },
        definitionProvider: true,
        hoverProvider: true,
        documentHighlightProvider: true,
        renameProvider: true,
        foldingRangeProvider: true,
        documentFormattingProvider: true,
        documentRangeFormattingProvider: true
      },
    };
  }


  private onDidChangeConfiguration(change: lsp.DidChangeConfigurationParams): void {
    this.globalSettings = change.settings;
    this.documentSettings = {};  // reset all document settings


    // dynamically enable & disable the formatter
    if (this.dynamicFormatterRegistration) {
      const enableFormatter = this.globalSettings && this.globalSettings.html &&
          this.globalSettings.html.format && this.globalSettings.html.format.enable;
      if (enableFormatter) {
        if (!this.formatterRegistration) {
          const documentSelector: DocumentSelector = [{language: 'typescript'}];
          this.formatterRegistration = this.connection.client.register(
              DocumentRangeFormattingRequest.type, {documentSelector});
        }
      } else if (this.formatterRegistration) {
        this.formatterRegistration.then(r => r.dispose());
        this.formatterRegistration = null;
      }
    }
  }

  private getDocumentSettings(textDocument: TextDocument, needsDocumentSettings: () => boolean):
      Thenable<Settings|undefined> {
    if (this.scopedSettingsSupport && needsDocumentSettings()) {
      let promise = this.documentSettings[textDocument.uri];
      if (!promise) {
        const scopeUri = textDocument.uri;
        const configRequestParam: ConfigurationParams = {
          items: [
            {scopeUri, section: 'css'}, {scopeUri, section: 'html'},
            {scopeUri, section: 'javascript'}
          ]
        };
        promise = this.connection.sendRequest(ConfigurationRequest.type, configRequestParam)
                      .then(s => ({css: s[0], html: s[1], javascript: s[2]}));
        this.documentSettings[textDocument.uri] = promise;
      }
      return promise;
    }
    return Promise.resolve(undefined);
  }


  private onDidOpenTextDocument(params: lsp.DidOpenTextDocumentParams) {
    const {uri, languageId} = params.textDocument;
    const filePath = uriToFilePath(uri);
    if (!filePath) {
      return;
    }
    const scriptKind = languageId === LanguageId.TS ? ts.ScriptKind.TS : ts.ScriptKind.External;
    // Since we are only keeping track of changes of files that are already on
    // disk (see documentSelector.scheme in extension.ts), the content on disk
    // is up-to-date when a file is first opened in the editor.
    // In this case, we should not pass fileContent to projectService.
    const fileContent = undefined;
    try {
      const result = this.projectService.openClientFile(filePath, fileContent, scriptKind);

      const {configFileName, configFileErrors} = result;
      if (configFileErrors && configFileErrors.length) {
        // configFileErrors is an empty array even if there's no error, so check length.
        this.connection.console.error(configFileErrors.map(e => e.messageText).join('\n'));
      }
      if (!configFileName) {
        this.connection.console.error(`No config file for ${filePath}`);
        return;
      }
      const project = this.projectService.findProject(configFileName);
      if (!project) {
        this.connection.console.error(`Failed to find project for ${filePath}`);
        return;
      }
      if (project.languageServiceEnabled) {
        project.refreshDiagnostics();  // Show initial diagnostics
      }
    } catch (error) {
      if (this.isProjectLoading) {
        this.isProjectLoading = false;
        this.connection.sendNotification(projectLoadingNotification.finish);
      }
      if (error.stack) {
        this.error(error.stack);
      }
      throw error;
    }
  }

  private onDidCloseTextDocument(params: lsp.DidCloseTextDocumentParams) {
    const {textDocument} = params;
    const filePath = uriToFilePath(textDocument.uri);
    if (!filePath) {
      return;
    }
    this.projectService.closeClientFile(filePath);
  }

  private onDidChangeTextDocument(params: lsp.DidChangeTextDocumentParams) {
    const {contentChanges, textDocument} = params;
    const filePath = uriToFilePath(textDocument.uri);
    if (!filePath) {
      return;
    }
    const scriptInfo = this.projectService.getScriptInfo(filePath);
    if (!scriptInfo) {
      this.connection.console.log(`Failed to get script info for ${filePath}`);
      return;
    }
    for (const change of contentChanges) {
      if ('range' in change) {
        const [start, end] = lspRangeToTsPositions(scriptInfo, change.range);
        scriptInfo.editContent(start, end, change.text);
      } else {
        // New text is considered to be the full content of the document.
        scriptInfo.editContent(0, scriptInfo.getSnapshot().getLength(), change.text);
      }
    }

    const project = this.projectService.getDefaultProjectForScriptInfo(scriptInfo);
    if (!project || !project.languageServiceEnabled) {
      return;
    }
    project.refreshDiagnostics();
  }

  private onDidSaveTextDocument(params: lsp.DidSaveTextDocumentParams) {
    const {text, textDocument} = params;
    const filePath = uriToFilePath(textDocument.uri);
    const scriptInfo = this.projectService.getScriptInfo(filePath);
    if (!scriptInfo) {
      return;
    }
    if (text) {
      scriptInfo.open(text);
    } else {
      scriptInfo.reloadFromFile();
    }
  }

  private onDefinition(params: lsp.TextDocumentPositionParams) {
    const {position, textDocument} = params;
    const filePath = uriToFilePath(textDocument.uri);
    const scriptInfo = this.projectService.getScriptInfo(filePath);
    if (!scriptInfo) {
      this.connection.console.log(`Script info not found for ${filePath}`);
      return;
    }

    const {fileName} = scriptInfo;
    const langSvc = this.projectService.getDefaultLanguageService(scriptInfo);
    if (!langSvc) {
      return;
    }

    const offset = lspPositionToTsPosition(scriptInfo, position);
    const definition = langSvc.getDefinitionAndBoundSpan(fileName, offset);
    if (!definition || !definition.definitions) {
      return;
    }
    const originSelectionRange = tsTextSpanToLspRange(scriptInfo, definition.textSpan);
    const results: lsp.LocationLink[] = [];
    for (const d of definition.definitions) {
      const scriptInfo = this.projectService.getScriptInfo(d.fileName);

      // Some definitions, like definitions of CSS files, may not be recorded files with a
      // `scriptInfo` but are still valid definitions because they are files that exist. In this
      // case, check to make sure that the text span of the definition is zero so that the file
      // doesn't have to be read; if the span is non-zero, we can't do anything with this
      // definition.
      if (!scriptInfo && d.textSpan.length > 0) {
        continue;
      }
      const range = scriptInfo ? tsTextSpanToLspRange(scriptInfo, d.textSpan) : EMPTY_RANGE;

      const targetUri = filePathToUri(d.fileName);
      results.push({
        originSelectionRange,
        targetUri,
        targetRange: range,
        targetSelectionRange: range,
      });
    }
    return results;
  }

  private onHover(params: lsp.TextDocumentPositionParams) {
    const {position, textDocument} = params;
    const filePath = uriToFilePath(textDocument.uri);
    if (!filePath) {
      return;
    }
    const scriptInfo = this.projectService.getScriptInfo(filePath);
    if (!scriptInfo) {
      return;
    }
    const langSvc = this.projectService.getDefaultLanguageService(scriptInfo);
    if (!langSvc) {
      return;
    }
    const offset = lspPositionToTsPosition(scriptInfo, position);
    const info = langSvc.getQuickInfoAtPosition(scriptInfo.fileName, offset);
    if (!info) {
      return;
    }
    const {kind, kindModifiers, textSpan, displayParts, documentation} = info;
    let desc = kindModifiers ? kindModifiers + ' ' : '';
    if (displayParts) {
      // displayParts does not contain info about kindModifiers
      // but displayParts does contain info about kind
      desc += displayParts.map(dp => dp.text).join('');
    } else {
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
    return {
      contents,
      range: tsTextSpanToLspRange(scriptInfo, textSpan),
    };
  }

  private _completions: lsp.CompletionItem[] = [];
  private _position?: lsp.Position;
  private _uri?: string;
  private onCompletion(params: lsp.CompletionParams) {
    const {position, textDocument} = params;
    const filePath = uriToFilePath(textDocument.uri);
    if (!filePath) {
      return;
    }
    const scriptInfo = this.projectService.getScriptInfo(filePath);
    if (!scriptInfo) {
      return;
    }
    const {fileName} = scriptInfo;
    const langSvc = this.projectService.getDefaultLanguageService(scriptInfo);
    if (!langSvc) {
      return;
    }
    const offset = lspPositionToTsPosition(scriptInfo, position);
    const completions = langSvc.getCompletionsAtPosition(
        fileName, offset,
        {
            // options
        });
    if (!completions) {
      return;
    }
    this._completions = completions.entries.map(
        (e) => tsCompletionEntryToLspCompletionItem(e, position, scriptInfo));
    this._uri = textDocument.uri;
    this._position = position;
    return this._completions;
  }

  private onCompletionResolve(params: lsp.CompletionItem): lsp.CompletionItem {
    const completion =
        this._completions.find(x => x.label == params.label && x.sortText == params.sortText);
    if (!this._position || !this._uri || !completion) {
      return params;
    }


    const filePath = uriToFilePath(this._uri);
    if (!filePath) {
      return params;
    }
    const scriptInfo = this.projectService.getScriptInfo(filePath);
    if (!scriptInfo) {
      return params;
    }
    const {fileName} = scriptInfo;
    const langSvc = this.projectService.getDefaultLanguageService(scriptInfo);
    if (!langSvc) {
      return params;
    }
    const offset = lspPositionToTsPosition(scriptInfo, this._position);
    const tsDetails = langSvc.getCompletionEntryDetails(
        fileName, offset, params.label,
        {
            // options
        },
        undefined, undefined);
    if (!tsDetails) {
      return params;
    }

    return tsCompletionEntryDetailsToLspCompletionItem(completion, tsDetails);
  }


  private onDocumentRangeFormatting(params: lsp.DocumentRangeFormattingParams): lsp.TextEdit[]|null
      |undefined {
    const result: lsp.TextEdit[] = [];
    const {textDocument, range, options} = params;
    const filePath = uriToFilePath(textDocument.uri);
    if (!filePath) {
      return result;
    }
    const scriptInfo = this.projectService.getScriptInfo(filePath);
    if (!scriptInfo) {
      return result;
    }
    const {fileName} = scriptInfo;
    const langSvc = this.projectService.getDefaultLanguageService(scriptInfo);
    if (!langSvc) {
      return result;
    }
    const tsRange = lspRangeToTsPositions(scriptInfo, range);
    const formattingOptions: ts.FormatCodeOptions|ts.FormatCodeSettings = {
      tabSize: options.tabSize,
      ConvertTabsToSpaces: options.insertSpaces
    };
    const edits =
        langSvc.getFormattingEditsForRange(fileName, tsRange[0], tsRange[1], formattingOptions);
    if (!edits) {
      return result;
    }

    for (const tsEdit of edits) {
      result.push({newText: tsEdit.newText, range: tsTextSpanToLspRange(scriptInfo, tsEdit.span)});
    }
    return result;
  }
  private onDocumentFormatting(params: lsp.DocumentFormattingParams): lsp.TextEdit[]|null
      |undefined {
    const result: lsp.TextEdit[] = [];
    const {textDocument, options} = params;
    const filePath = uriToFilePath(textDocument.uri);
    if (!filePath) {
      return result;
    }
    const scriptInfo = this.projectService.getScriptInfo(filePath);
    if (!scriptInfo) {
      return result;
    }
    const {fileName} = scriptInfo;
    const langSvc = this.projectService.getDefaultLanguageService(scriptInfo);
    if (!langSvc) {
      return result;
    }

    const formattingOptions: ts.FormatCodeOptions|ts.FormatCodeSettings = {
      tabSize: options.tabSize,
      ConvertTabsToSpaces: options.insertSpaces
    };

    const length = scriptInfo.getSnapshot().getLength();
    const edits = langSvc.getFormattingEditsForRange(fileName, 0, length, formattingOptions);
    if (!edits) {
      return result;
    }

    for (const tsEdit of edits) {
      result.push({newText: tsEdit.newText, range: tsTextSpanToLspRange(scriptInfo, tsEdit.span)});
    }
    return result;
  }

  private onDocumentHighlight(params: lsp.DocumentHighlightParams): lsp.DocumentHighlight[] {
    const result: lsp.DocumentHighlight[] = [];
    const {position, textDocument} = params;
    const filePath = uriToFilePath(textDocument.uri);
    if (!filePath) {
      return result;
    }
    const scriptInfo = this.projectService.getScriptInfo(filePath);
    if (!scriptInfo) {
      return result;
    }
    const {fileName} = scriptInfo;
    const langSvc = this.projectService.getDefaultLanguageService(scriptInfo);
    if (!langSvc) {
      return result;
    }
    const offset = lspPositionToTsPosition(scriptInfo, position);
    const completions = langSvc.getDocumentHighlights(fileName, offset, [fileName]) || [];
    if (!completions) {
      return result;
    }

    for (const entriesInFile of completions) {
      for (const entry of entriesInFile.highlightSpans) {
        result.push(lsp.DocumentHighlight.create(
            tsTextSpanToLspRange(scriptInfo, entry.textSpan), DocumentHighlightKind.Text));
      }
    }
    return result;
  }

  private onFoldingRanges(params: lsp.FoldingRangeRequestParam): lsp.FoldingRange[] {
    const result: lsp.FoldingRange[] = [];
    const {textDocument} = params;
    const filePath = uriToFilePath(textDocument.uri);
    if (!filePath) {
      return result;
    }
    const scriptInfo = this.projectService.getScriptInfo(filePath);
    if (!scriptInfo) {
      return result;
    }
    const {fileName} = scriptInfo;
    const langSvc = this.projectService.getDefaultLanguageService(scriptInfo);
    if (!langSvc) {
      return result;
    }
    const outliningSpans = langSvc.getOutliningSpans(fileName) || [];
    if (!outliningSpans) {
      return result;
    }

    for (const outliningSpan of outliningSpans) {
      const start = scriptInfo.positionToLineOffset(outliningSpan.textSpan.start);
      const end = scriptInfo.positionToLineOffset(
          outliningSpan.textSpan.start + outliningSpan.textSpan.length);
      result.push(lsp.FoldingRange.create(
          start.line - 1, end.line - 1, start.offset - 1, end.offset - 1, outliningSpan.kind));
    }
    return result;
  }

  /**
   * Show an error message.
   *
   * @param message The message to show.
   */
  error(message: string): void {
    this.connection.console.error(message);
  }

  /**
   * Show a warning message.
   *
   * @param message The message to show.
   */
  warn(message: string): void {
    this.connection.console.warn(message);
  }

  /**
   * Show an information message.
   *
   * @param message The message to show.
   */
  info(message: string): void {
    this.connection.console.info(message);
  }

  /**
   * Log a message.
   *
   * @param message The message to log.
   */
  log(message: string): void {
    this.connection.console.log(message);
  }

  /**
   * Start listening on the input stream for messages to process.
   */
  listen() {
    this.connection.listen();
  }

  /**
   * Determine if the specified `project` is Angular, and disable the language
   * service if not.
   * @param project
   */
  private checkIsAngularProject(project: ts.server.Project) {
    const NG_CORE = '@angular/core/core.d.ts';
    const {projectName} = project;
    if (!project.languageServiceEnabled) {
      const msg = `Language service is already disabled for ${projectName}. ` +
          `This could be due to non-TS files that exceeded the size limit (${
                      ts.server.maxProgramSizeForNonTsFiles} bytes).` +
          `Please check log file for details.`;
      this.connection.console.info(msg);  // log to remote console to inform users
      project.log(msg);  // log to file, so that it's easier to correlate with ts entries
      return;
    }
    if (!isAngularProject(project, NG_CORE)) {
      project.disableLanguageService();
      const totalFiles = project.getFileNames().length;
      const msg =
          `Disabling language service for ${projectName} because it is not an Angular project. ` +
          `There are ${totalFiles} files in the project but '${NG_CORE}' is not detected.`;
      this.connection.console.info(msg);
      project.log(msg);
      if (project.getExcludedFiles().some(f => f.endsWith(NG_CORE))) {
        const msg =
            `Please check your tsconfig.json to make sure 'node_modules' directory is not excluded.`;
        this.connection.console.info(msg);
        project.log(msg);
      }
    }
  }
}



/**
 * Return true if the specified `project` contains the Angular core declaration.
 * @param project
 * @param ngCore path that uniquely identifies `@angular/core`.
 */
function isAngularProject(project: ts.server.Project, ngCore: string): boolean {
  project.markAsDirty();  // Must mark project as dirty to rebuild the program.
  if (project.isNonTsProject()) {
    return false;
  }
  for (const fileName of project.getFileNames()) {
    if (fileName.endsWith(ngCore)) {
      return true;
    }
  }
  return false;
}
