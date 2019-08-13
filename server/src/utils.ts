import URI from 'vscode-uri';

enum Scheme {
  File = 'file',
};

export function uriToFilePath(uri: string): string {
  const {scheme, path} = URI.parse(uri);
  if (scheme !== Scheme.File) {
    return '';
  }
  return path;
}

export function filePathToUri(filePath: string): string {
  return URI.from({
    scheme: Scheme.File,
    path: filePath,
  }).toString();
}
