import * as ts from 'typescript/lib/tsserverlibrary';
import {LanguageService as CssLanguageService} from 'vscode-css-languageservice';
import {LanguageService as HtmlLanguageService} from 'vscode-html-languageservice';
import * as vscode from 'vscode-languageserver-types';

import {CompletionsCache} from './completions_cache';
import {Configuration} from './configuration';
import {CssMode} from './modes/css_mode';
import {HtmlMode} from './modes/html_modle';
import {UnknowMode} from './modes/unknow_mode';
import {TemplateContext, TemplateLanguageService} from './typescript-template-language-service-decorator';
import {VirtualDocumentProvider} from './virtual_document_provider';

export class LanguageService implements TemplateLanguageService {
  private _completionsCache = new CompletionsCache();
  private htmlMode: HtmlMode;
  private cssMode: CssMode;
  private unknowMode: UnknowMode;
  constructor(
      private readonly typescript: typeof ts,
      private readonly configuration: Configuration,
      private readonly virtualDocumentProvider: VirtualDocumentProvider,
      private readonly htmlLanguageService: HtmlLanguageService,
      private readonly cssLanguageService: CssLanguageService,
  ) {
    this.htmlMode = new HtmlMode(this.htmlLanguageService, this.typescript);
    this.cssMode = new CssMode(this.cssLanguageService, this.typescript);
    this.unknowMode = new UnknowMode(this.typescript);
  }

  public getMode(languageId: string) {
    if (languageId === 'html') {
      return this.htmlMode;
    } else if (languageId === 'css') {
      return this.cssMode;
    }
    return this.unknowMode;
  }

  public getCompletionsAtPosition(
      context: TemplateContext,
      position: ts.LineAndCharacter,
      ): ts.CompletionInfo {
    const document = this.virtualDocumentProvider.createVirtualDocument(context);
    const mode = this.getMode(document.languageId);
    return mode.getCompletionsAtPosition(document, context, position, this.configuration);
  }

  public getCompletionEntryDetails(
      context: TemplateContext,
      position: ts.LineAndCharacter,
      name: string,
      ): ts.CompletionEntryDetails {
    const document = this.virtualDocumentProvider.createVirtualDocument(context);
    const mode = this.getMode(document.languageId);
    return mode.getCompletionEntryDetails(document, context, position, this.configuration, name);
  }

  public getQuickInfoAtPosition(
      context: TemplateContext,
      position: ts.LineAndCharacter,
      ): ts.QuickInfo|undefined {
    const document = this.virtualDocumentProvider.createVirtualDocument(context);
    const mode = this.getMode(document.languageId);
    return mode.getQuickInfoAtPosition(document, context, position);
  }

  public getSyntacticDiagnostics(
      context: TemplateContext,
      ): ts.Diagnostic[] {
    return [];
  }

  public getOutliningSpans(
      context: TemplateContext,
      ): ts.OutliningSpan[] {
    const document = this.virtualDocumentProvider.createVirtualDocument(context);
    const mode = this.getMode(document.languageId);
    return mode.getOutliningSpans(document, context);
  }

  public getSemanticDiagnostics(
      context: TemplateContext,
      ): ts.Diagnostic[] {
    const document = this.virtualDocumentProvider.createVirtualDocument(context);
    const mode = this.getMode(document.languageId);
    return mode.getSemanticDiagnostics(document, context, this.configuration);
  }

  public getFormattingEditsForRange(
      context: TemplateContext,
      start: number,
      end: number,
      settings: ts.EditorSettings,
      ): ts.TextChange[] {
    const document = this.virtualDocumentProvider.createVirtualDocument(context);
    const mode = this.getMode(document.languageId);
    return mode.getFormattingEditsForRange(
        document, context, start, end, settings, this.configuration);
  }

  public getSupportedCodeFixes(): number[] {
    return [];
  }

  public getCodeFixesAtPosition(
      context: TemplateContext,
      start: number,
      end: number,
      errorCodes: ReadonlyArray<number>,
      formatOptions: ts.FormatCodeSettings,
      ): Array<ts.CodeAction|ts.CodeFixAction> {
    return [];
  }

  public getDefinitionAtPosition(
      context: TemplateContext,
      position: ts.LineAndCharacter,
      ): ts.DefinitionInfo[] {
    return [];
  }

  public getSignatureHelpItemsAtPosition(
      context: TemplateContext,
      position: ts.LineAndCharacter,
      ): ts.SignatureHelpItems|undefined {
    return;
  }

  public getReferencesAtPosition(
      context: TemplateContext,
      position: ts.LineAndCharacter,
      ): ts.ReferenceEntry[]|undefined {
    return;
  }

  public getJsxClosingTagAtPosition(
      context: TemplateContext,
      position: ts.LineAndCharacter,
      ): ts.JsxClosingTagInfo|undefined {
    return;
  }
}
