import * as path from 'path';
import * as fs from 'fs';
import { workspace, ExtensionContext } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, RevealOutputChannelOn } from 'vscode-languageclient';

export function activate(context: ExtensionContext) {
	const logFile = path.join(context.logPath, 'nglangsvc.log');
	fs.mkdirSync(context.logPath);
	fs.closeSync(fs.openSync(logFile, 'w'));

  // The server is implemented in node
  const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run : {
			module: serverModule,
			transport: TransportKind.ipc,
			args: ['--logFile', logFile],
			options: {
				env: {
					// Force TypeScript to use the non-polling version of the file watchers.
					TSC_NONPOLLING_WATCHER: true,
				},
			},
		},
    debug: {	// debug is used when running in vscode development mode
			module: serverModule,
			transport: TransportKind.ipc,
			args: ['--logFile', logFile],
			options: {
				env: {
					// Force TypeScript to use the non-polling version of the file watchers.
					TSC_NONPOLLING_WATCHER: true,
					NG_DEBUG: true,
				},
				execArgv : [
					// '--nolazy',
					// '--debug=6009',
					'--inspect=6009',
				],
			},
			/* *, options: debugOptions /* */ }
  }

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for Angular templates
    documentSelector: ['ng-template', 'html', 'typescript'],

    // Information in the TypeScript project is necessary to generate Angular template completions
    synchronize: {
      fileEvents: [
        workspace.createFileSystemWatcher('**/tsconfig.json'),
        workspace.createFileSystemWatcher('**/*.ts'),
      ]
    },

    // Don't let our output console pop open
    revealOutputChannelOn: RevealOutputChannelOn.Never
  }

  // Create the language client and start the client.
  const disposable = new LanguageClient('Angular Language Service', serverOptions, clientOptions).start();

  // Push the disposable to the context's subscriptions so that the
  // client can be deactivated on extension deactivation
  context.subscriptions.push(disposable);
}
