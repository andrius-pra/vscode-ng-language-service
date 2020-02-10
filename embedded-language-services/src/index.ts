import * as ts from 'typescript/lib/tsserverlibrary';
import { TypescriptPlugin } from './plugin';

export = (mod: { typescript: typeof ts }) => new TypescriptPlugin(mod.typescript);
