import { HTMLFormatConfiguration } from 'vscode-html-languageservice';
import { LanguageSettings, LintSettings, CompletionSettings } from 'vscode-css-languageservice';

// TODO cleanup

export class Configuration {
    public pluginName = 'embedded-language-services';
    public html = {
        autoClosingTags: true,
        format: {
            enable: true,
            contentUnformatted: 'pre,code,textarea',
            endWithNewline: false,
            extraLiners: 'head, body, /html',
            indentHandlebars: false,
            indentInnerHtml: false,
            insertSpaces: true,
            maxPreserveNewLines: 2000,
            preserveNewLines: undefined,
            tabSize: 4,
            unformatted: 'wbr',
            wrapAttributes: 'auto',
            wrapAttributesIndentSize: undefined,
            wrapLineLength: 120,
        } as HTMLFormatConfiguration & { enable: boolean },
        suggest: {
            html5: true,
            angularjs: false,
        },
        validate: {
            scripts: false,
            styles: false,
        },
    };

    public css: LanguageSettings = {
        completion: {
            triggerPropertyValueCompletion: true,
        },
        lint: {
            compatibleVendorPrefixes: 'error',
            duplicateProperties: 'error',
            emptyRules: 'error',
            float: 'error',
            fontFaceProperties: 'error',
            hexColorLength: 'error',
            idSelector: 'error',
            ieHack: 'error',
            important: 'error',
            importStatement: 'error',
            propertyIgnoredDueToDisplay: 'error',
            universalSelector: 'error',
            unknownAtRules: 'error',
            unknownProperties: 'error',
            unknownVendorSpecificProperties: 'error',
            validProperties: 'error',
            vendorPrefix: 'error',
            zeroUnits: 'error',
        },
        validate: true,
    };

    public update(config: { name: string, options: typeof defaultOptions }): void {
        this.html = config.options.html;
        this.css = config.options.css;
    }
}

// TODO convert to types
const defaultOptions = {
    html: {
        autoClosingTags: true,
        format: {} as HTMLFormatConfiguration & { enable: boolean },
        suggest: {
            html5: true,
            angularjs: false,
        },
        validate: {
            scripts: false,
            styles: false,
        },
    },
    css: {} as LanguageSettings,
};
