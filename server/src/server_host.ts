import * as tss from 'typescript/lib/tsserverlibrary';

export class ServerHost implements tss.server.ServerHost {
  readonly args: string[];
  readonly newLine: string;
  readonly useCaseSensitiveFileNames: boolean;

  constructor(private readonly sys: tss.System) {
    this.args = sys.args;
    this.newLine = sys.newLine;
    this.useCaseSensitiveFileNames = sys.useCaseSensitiveFileNames;
  }

  write(s: string): void {
    this.sys.write(s);
  }

  writeOutputIsTTY(): boolean {
    return this.sys.writeOutputIsTTY!();
  }

  readFile(path: string, encoding?: string): string | undefined {
    return this.sys.readFile(path, encoding);
  }

  getFileSize(path: string): number {
    return this.sys.getFileSize!(path);
  }

  writeFile(path: string, data: string, writeByteOrderMark?: boolean): void {
    return this.sys.writeFile(path, data, writeByteOrderMark);
  }

  /**
   * @pollingInterval - this parameter is used in polling-based watchers and ignored in watchers that
   * use native OS file watching
   */
  watchFile(path: string, callback: tss.FileWatcherCallback, pollingInterval?: number): tss.FileWatcher {
    return this.sys.watchFile!(path, callback, pollingInterval);
  }

  watchDirectory(path: string, callback: tss.DirectoryWatcherCallback, recursive?: boolean): tss.FileWatcher {
    return this.sys.watchDirectory!(path, callback, recursive);
  }

  resolvePath(path: string): string {
    return this.sys.resolvePath(path);
  }

  fileExists(path: string): boolean {
    return this.sys.fileExists(path);
  }

  directoryExists(path: string): boolean {
    return this.sys.directoryExists(path);
  }

  createDirectory(path: string): void {
    return this.sys.createDirectory(path);
  }

  getExecutingFilePath(): string {
    return this.sys.getExecutingFilePath();
  }

  getCurrentDirectory(): string {
    return this.sys.getCurrentDirectory();
  }

  getDirectories(path: string): string[] {
    return this.sys.getDirectories(path);
  }

  readDirectory(path: string, extensions?: ReadonlyArray<string>, exclude?: ReadonlyArray<string>, include?: ReadonlyArray<string>, depth?: number): string[] {
    return this.sys.readDirectory(path, extensions, exclude, include, depth);
  }

  getModifiedTime(path: string): Date | undefined {
    return this.sys.getModifiedTime!(path);
  }

  setModifiedTime(path: string, time: Date): void {
    return this.sys.setModifiedTime!(path, time);
  }

  deleteFile(path: string): void {
    return this.sys.deleteFile!(path);
  }

  /**
   * A good implementation is node.js' `crypto.createHash`. (https://nodejs.org/api/crypto.html#crypto_crypto_createhash_algorithm)
   */
  createHash(data: string): string {
    return this.sys.createHash!(data);
  }

  /** This must be cryptographically secure. Only implement this method using `crypto.createHash("sha256")`. */
  createSHA256Hash(data: string): string {
    return this.sys.createSHA256Hash!(data);
  }

  getMemoryUsage(): number {
    return this.sys.getMemoryUsage!();
  }

  exit(exitCode?: number): void {
    return this.sys.exit(exitCode);
  }

  realpath(path: string): string {
    return this.sys.realpath!(path);
  }

  setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): any {
    return this.sys.setTimeout!(callback, ms, ...args);
  }

  clearTimeout(timeoutId: any): void {
    return this.sys.clearTimeout!(timeoutId);
  }

  clearScreen(): void {
    return this.sys.clearScreen!();
  }

  base64decode(input: string): string {
    return this.sys.base64decode!(input);
  }

  base64encode(input: string): string {
    return this.sys.base64encode!(input);
  }

  setImmediate(callback: (...args: any[]) => void, ...args: any[]): any {
    return setImmediate(callback, ...args);
  }

  clearImmediate(timeoutId: any): void {
    return clearImmediate(timeoutId);
  }

  require(initialPath: string, moduleName: string) {
    try {
      const modulePath = require.resolve(moduleName, {
        paths: [initialPath],
      });
      return {
        module: require(modulePath),
        error: undefined,
      };
    }
    catch(e) {
      return {
        module: undefined,
        error: e as Error,
      };
    }
  }
}
