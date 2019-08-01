import * as tss from 'typescript/lib/tsserverlibrary';
import {ServerHost} from './server_host';
import {Logger} from './logger';
import * as lsp from 'vscode-languageserver';

export class ProjectService {
	tsProjSvc: tss.server.ProjectService;

	constructor(
		private readonly host: ServerHost,
		private readonly logger: Logger,
		private readonly console: lsp.RemoteConsole,
	) {
		const pluginProbeLocation = host.getCurrentDirectory();
		console.info(`Launching @angular/language-service from ${pluginProbeLocation}`);

		if (process.env.TSC_NONPOLLING_WATCHER !== 'true') {
			console.warn(`Using less efficient polling watcher. Make sure TSC_NONPOLLING_WATCHER is set.`);
		}

		this.tsProjSvc = new tss.server.ProjectService({
			host,
			logger,
			cancellationToken: tss.server.nullCancellationToken,
			useSingleInferredProject: true,
			useInferredProjectPerProjectRoot: true,
			typingsInstaller: tss.server.nullTypingsInstaller,

			globalPlugins: ['@angular/language-service'],
			pluginProbeLocations: [pluginProbeLocation],
			allowLocalPluginLoads: false,	// do not load plugins from tsconfig.json
			// allowLocalPluginLoads: true,
		});

		const globalPlugins = this.tsProjSvc.globalPlugins;
		if (globalPlugins.includes('@angular/language-service')) {
			console.info('Success: @angular/language-service loaded');
		}
		else {
			console.error('Failed to load @angular/language-service');
		}
	}

	getDefaultProjectForScriptInfo(info: tss.server.ScriptInfo): tss.server.Project | undefined {
		let project = this.tsProjSvc.getDefaultProjectForFile(
			info.fileName,
			false // ensureProject
		);

		if (!project || project.projectKind !== tss.server.ProjectKind.Configured) {
			const {configFileName} = this.tsProjSvc.openClientFile(info.fileName);
			if (!configFileName) {
				// Failed to find a config file. There is nothing we could do.
				return;
			}
			project = this.tsProjSvc.findProject(configFileName);
			if (!project) {
				return;
			}
			info.detachAllProjects();
			info.attachToProject(project);
		}

		return project;
	}
}
