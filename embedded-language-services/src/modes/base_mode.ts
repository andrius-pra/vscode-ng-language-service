import * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-types';
import {FoldingRange} from 'vscode-languageserver-types';

import {CompletionsCache, HtmlCachedCompletionList} from '../completions_cache';
import {Configuration} from '../configuration';
import {TemplateContext} from '../typescript-template-language-service-decorator';

export abstract class BaseMode {
  protected _completionsCache = new CompletionsCache();

  constructor(
      protected readonly typescript: typeof ts,
  ) {}

  public abstract getCompletionsAtPosition(
      document: vscode.TextDocument, context: TemplateContext, position: ts.LineAndCharacter,
      configuration: Configuration): ts.CompletionInfo;

  public abstract getCompletionEntryDetails(
      document: vscode.TextDocument,
      context: TemplateContext,
      position: ts.LineAndCharacter,
      configuration: Configuration,
      name: string,
      ): ts.CompletionEntryDetails;

  public abstract getQuickInfoAtPosition(
      document: vscode.TextDocument,
      context: TemplateContext,
      position: ts.LineAndCharacter,
      ): ts.QuickInfo|undefined;

  public abstract getOutliningSpans(
      document: vscode.TextDocument,
      context: TemplateContext,
      ): ts.OutliningSpan[];

  public abstract getFormattingEditsForRange(
      document: vscode.TextDocument,
      context: TemplateContext,
      start: number,
      end: number,
      settings: ts.EditorSettings,
      configuration: Configuration,
      ): ts.TextChange[];

  public abstract getSemanticDiagnostics(
      document: vscode.TextDocument,
      context: TemplateContext,
      configuration: Configuration,
      ): ts.Diagnostic[];

  protected translateHover(
      hover: vscode.Hover,
      position: ts.LineAndCharacter,
      context: TemplateContext,
      ): ts.QuickInfo {
    const header: ts.SymbolDisplayPart[] = [];
    const docs: ts.SymbolDisplayPart[] = [];
    const convertPart = (hoverContents: typeof hover.contents) => {
      if (typeof hoverContents === 'string') {
        docs.push({kind: 'unknown', text: hoverContents});
      } else if (Array.isArray(hoverContents)) {
        hoverContents.forEach(convertPart);
      } else {
        header.push({kind: 'unknown', text: hoverContents.value});
      }
    };
    convertPart(hover.contents);
    const start = context.toOffset(hover.range ? hover.range.start : position);
    return {
      kind: this.typescript.ScriptElementKind.string,
      kindModifiers: '',
      textSpan: {
        start,
        length: hover.range ? context.toOffset(hover.range.end) - start : 1,
      },
      displayParts: header,
      documentation: docs,
      tags: [],
    };
  }

  protected translateCompletionItemsToCompletionEntryDetails(
      typescript: typeof ts,
      item: vscode.CompletionItem,
      ): ts.CompletionEntryDetails {
    return {
      name: item.label,
      kindModifiers: 'declare',
      kind: item.kind ? this.translateionCompletionItemKind(typescript, item.kind) :
                        typescript.ScriptElementKind.unknown,
      displayParts: this.toDisplayParts(item.detail),
      documentation: this.toDisplayParts(item.documentation),
      tags: [],
    };
  }

  protected toDisplayParts(
      text: string|vscode.MarkupContent|undefined,
      ): ts.SymbolDisplayPart[] {
    if (!text) {
      return [];
    }
    return [{
      kind: 'text',
      text: typeof text === 'string' ? text : text.value,
    }];
  }

  protected translateOutliningSpan(
      context: TemplateContext,
      range: FoldingRange,
      ): ts.OutliningSpan {
    const startOffset =
        context.toOffset({line: range.startLine, character: range.startCharacter || 0});
    const endOffset = context.toOffset({line: range.endLine, character: range.endCharacter || 0});
    const span = {
      start: startOffset,
      length: endOffset - startOffset,
    };

    return {
      autoCollapse: false,
      kind: this.typescript.OutliningSpanKind.Code,
      bannerText: '',
      textSpan: span,
      hintSpan: span,
    };
  }

  protected translateCompletionItemsToCompletionInfo(
      typescript: typeof ts,
      context: TemplateContext,
      items: vscode.CompletionList,
      ): ts.CompletionInfo {
    return {
      isGlobalCompletion: false,
      isMemberCompletion: false,
      isNewIdentifierLocation: false,
      entries: items.items.map(x => this.translateCompetionEntry(typescript, context, x)),
    };
  }

  protected translateCompetionEntry(
      typescript: typeof ts,
      context: TemplateContext,
      vsItem: vscode.CompletionItem,
      ): ts.CompletionEntry {
    const kind = vsItem.kind ? this.translateionCompletionItemKind(typescript, vsItem.kind) :
                               typescript.ScriptElementKind.unknown;
    const entry: ts.CompletionEntry = {
      name: vsItem.label,
      kind,
      sortText: vsItem.sortText ?? vsItem.label,
    };

    if (vsItem.textEdit) {
      entry.insertText = vsItem.textEdit.newText;
      entry.replacementSpan = this.toTsSpan(context, vsItem.textEdit.range);
    }

    return entry;
  }

  protected translateionCompletionItemKind(
      typescript: typeof ts,
      kind: vscode.CompletionItemKind,
      ): ts.ScriptElementKind {
    switch (kind) {
      case vscode.CompletionItemKind.Method:
        return typescript.ScriptElementKind.memberFunctionElement;
      case vscode.CompletionItemKind.Function:
        return typescript.ScriptElementKind.functionElement;
      case vscode.CompletionItemKind.Constructor:
        return typescript.ScriptElementKind.constructorImplementationElement;
      case vscode.CompletionItemKind.Field:
      case vscode.CompletionItemKind.Variable:
        return typescript.ScriptElementKind.variableElement;
      case vscode.CompletionItemKind.Class:
        return typescript.ScriptElementKind.classElement;
      case vscode.CompletionItemKind.Interface:
        return typescript.ScriptElementKind.interfaceElement;
      case vscode.CompletionItemKind.Module:
        return typescript.ScriptElementKind.moduleElement;
      case vscode.CompletionItemKind.Property:
        return typescript.ScriptElementKind.memberVariableElement;
      case vscode.CompletionItemKind.Unit:
      case vscode.CompletionItemKind.Value:
        return typescript.ScriptElementKind.constElement;
      case vscode.CompletionItemKind.Enum:
        return typescript.ScriptElementKind.enumElement;
      case vscode.CompletionItemKind.Keyword:
        return typescript.ScriptElementKind.keyword;
      case vscode.CompletionItemKind.Color:
        return 'color' as ts.ScriptElementKind;
      case vscode.CompletionItemKind.Reference:
        return typescript.ScriptElementKind.alias;
      case vscode.CompletionItemKind.File:
        return typescript.ScriptElementKind.moduleElement;
      case vscode.CompletionItemKind.Snippet:
      case vscode.CompletionItemKind.Text:
      default:
        return typescript.ScriptElementKind.unknown;
    }
  }

  protected toTsSpan(
      context: TemplateContext,
      range: vscode.Range,
      ): ts.TextSpan {
    const editStart = context.toOffset(range.start);
    const editEnd = context.toOffset(range.end);

    return {
      start: editStart,
      length: editEnd - editStart,
    };
  }

  protected toVsRange(
      context: TemplateContext,
      start: number,
      end: number,
      ): vscode.Range {
    return {
      start: context.toPosition(start),
      end: context.toPosition(end),
    };
  }

  protected toTsTextChange(
      context: TemplateContext,
      vsedit: vscode.TextEdit,
  ) {
    return {
      span: this.toTsSpan(context, vsedit.range),
      newText: vsedit.newText,
    };
  }

  protected translateSeverity(
      typescript: typeof ts,
      severity: vscode.DiagnosticSeverity|undefined,
      ): ts.DiagnosticCategory {
    switch (severity) {
      case vscode.DiagnosticSeverity.Information:
      case vscode.DiagnosticSeverity.Hint:
        return typescript.DiagnosticCategory.Message;

      case vscode.DiagnosticSeverity.Warning:
        return typescript.DiagnosticCategory.Warning;

      case vscode.DiagnosticSeverity.Error:
      default:
        return typescript.DiagnosticCategory.Error;
    }
  }

  protected translateDiagnostics(
      diagnostics: vscode.Diagnostic[],
      doc: vscode.TextDocument,
      context: TemplateContext,
      content: string,
      configuration: Configuration,
      errorCode: number,
  ) {
    const sourceFile = context.node.getSourceFile();
    return diagnostics.map(
        diag => this.translateDiagnostic(
            diag, sourceFile, doc, context, content, configuration, errorCode));
  }

  protected translateDiagnostic(
      diagnostic: vscode.Diagnostic,
      file: ts.SourceFile,
      doc: vscode.TextDocument,
      context: TemplateContext,
      content: string,
      configuration: Configuration,
      errorCode: number,
      ): ts.Diagnostic|undefined {
    // Make sure returned error is within the real document
    if (diagnostic.range.start.line === 0 || diagnostic.range.start.line > doc.lineCount ||
        diagnostic.range.start.character >= content.length) {
      return undefined;
    }

    const start = context.toOffset(diagnostic.range.start);
    const length = context.toOffset(diagnostic.range.end) - start;
    const code = typeof diagnostic.code === 'number' ? diagnostic.code : errorCode;
    return {
      code,
      messageText: diagnostic.message,
      category: this.translateSeverity(this.typescript, diagnostic.severity),
      file,
      start,
      length,
      source: configuration.pluginName,
    };
  }
}
