import URI from 'vscode-uri';

export function uriToFilePath(uri: string): string|undefined {
	const {scheme, path} = URI.parse(uri);
	if (scheme !== 'file') {
		return;
	}
	return path;
}
