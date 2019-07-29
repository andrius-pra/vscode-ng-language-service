import * as tss from 'typescript/lib/tsserverlibrary';
import {ServerHost} from './server_host';
import {Logger} from './logger';

export class ProjectService {
	tsProjSvc: tss.server.ProjectService;

	constructor(
		private readonly host: ServerHost,
		private readonly logger: Logger,
	) {
		this.tsProjSvc = new tss.server.ProjectService({
			host,
			logger,
			cancellationToken: tss.server.nullCancellationToken,
			useSingleInferredProject: true,
			useInferredProjectPerProjectRoot: true,
			typingsInstaller: tss.server.nullTypingsInstaller,

			// globalPlugins: ['@angular/language-service'],
			// pluginProbeLocations: [host.getCurrentDirectory()],
			// allowLocalPluginLoads: true,
			// allowLocalPluginLoads: false,
		});
	}

	getProjectForTemplate(fileName: string): tss.server.Project | undefined {
		const {configFileName} = this.tsProjSvc.openClientFile(fileName);
		if (!configFileName) {
			// Failed to find a config file. There is nothing we could do.
			return;
		}

		const project = this.tsProjSvc.findProject(configFileName);
		if (project) {
			return project;
		}

		// Need to create a project based on the config that we found.
		const scriptInfo = this.tsProjSvc.getScriptInfoForNormalizedPath(configFileName);
		if (!scriptInfo) {
			return;
		}
		// No need to ensure project since it's likely not dirty
		return this.tsProjSvc.getDefaultProjectForFile(scriptInfo.fileName, /* ensureProject */ true);
	}

}
