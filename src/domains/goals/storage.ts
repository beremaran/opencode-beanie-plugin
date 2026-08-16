import {chmod, mkdir, rename, rm} from "node:fs/promises";
import {dirname, parse} from "node:path";

export const writeAtomically = async (path: string, content: string): Promise<void> => {
    await mkdir(dirname(path), {recursive: true});
    await chmod(dirname(path), 0o700);
    const temporary = `${path}.${parse(path).name}.${crypto.randomUUID()}.tmp`;

    try {
        await Bun.write(temporary, content);
        await chmod(temporary, 0o600);
        await rename(temporary, path);
        await chmod(path, 0o600);
    } finally {
        await rm(temporary, {force: true});
    }
};
