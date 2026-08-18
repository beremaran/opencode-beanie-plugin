const PLUGIN_SEGMENT = "opencode-beanie-plugin";

const PLUGIN_QUOTED = `"@beremaran/opencode-beanie-plugin"`;

const WHITESPACE_RE = /\s/;

const TRAILING_SEPARATOR_RE = /[/\\]+$/;

const SEPARATOR_RE = /[/\\]/;

export const PLUGIN_NAME = "@beremaran/opencode-beanie-plugin";

const isWhitespace = (char: string | undefined): boolean => char !== undefined && WHITESPACE_RE.test(char);

const containsPluginSegment = (value: string): boolean =>
    value.replace(TRAILING_SEPARATOR_RE, "").split(SEPARATOR_RE).includes(PLUGIN_SEGMENT);

export function isPluginEntryName(value: unknown): boolean {
    if (typeof value !== "string") {return false;}
    return value === PLUGIN_NAME || value === PLUGIN_SEGMENT || containsPluginSegment(value);
}

const firstIndexOf = (text: string, needles: string[]): number => {
    const indexes = needles.map((needle) => text.indexOf(needle)).filter((index) => index !== -1);

    if (indexes.length > 0) {return Math.min(...indexes);}
    return -1;
};

function stepInString(escaped: boolean, char: string | undefined): {escaped: boolean; inString: boolean} {
    if (escaped) {return {escaped: false, inString: true};}
    if (char === "\\") {return {escaped: true, inString: true};}
    return {escaped: false, inString: char !== '"'};
}

function findMatching(text: string, open: number, openChar: string, closeChar: string): number {
    let depth = 0;

    let inString = false;

    let escaped = false;

    for (let i = open; i < text.length; i += 1) {
        const char = text[i];

        if (inString) {({escaped, inString} = stepInString(escaped, char));}
        else if (char === '"') {inString = true;}
        else if (char === openChar) {depth += 1;}
        else if (char === closeChar) {
            depth -= 1;
            if (depth === 0) {return i;}
        }
    }
    return -1;
}

export function findPluginNameSpan(text: string): [number, number] | null {
    const nameIndex = firstIndexOf(text, [PLUGIN_NAME, PLUGIN_SEGMENT]);

    if (nameIndex === -1) {return null;}

    let start = nameIndex;

    while (start > 0 && text[start] !== '"') {start -= 1;}
    if (text[start] !== '"') {return null;}

    let end = start + 1;

    while (end < text.length && text[end] !== '"') {
        if (text[end] === "\\") {end += 1;}
        end += 1;
    }
    if (end >= text.length) {return null;}
    return [start, end + 1];
}

export function findPluginEntrySpan(text: string): [number, number] | null {
    const nameSpan = findPluginNameSpan(text);

    if (!nameSpan) {return null;}

    const [start, end] = nameSpan;

    let i = end;

    while (isWhitespace(text[i])) {i += 1;}
    if (text[i] !== ",") {return [start, end];}
    i += 1;
    while (isWhitespace(text[i])) {i += 1;}
    if (text[i] !== "{") {return [start, end];}

    const objectEnd = findMatching(text, i, "{", "}");

    if (objectEnd === -1) {return null;}

    let close = objectEnd + 1;

    let after = objectEnd + 1;

    while (isWhitespace(text[after])) {after += 1;}
    if (text[after] === "]") {close = after + 1;}

    let begin = start;

    let before = start - 1;

    while (before >= 0 && isWhitespace(text[before])) {before -= 1;}
    if (text[before] === "[") {begin = before;}
    return [begin, close];
}

export function findPluginArrayOpen(text: string): number | null {
    const needle = `"plugin"`;

    let from = 0;

    for (;;) {
        const idx = text.indexOf(needle, from);

        if (idx === -1) {return null;}

        let i = idx + needle.length;

        while (isWhitespace(text[i])) {i += 1;}
        if (text[i] === ":") {
            i += 1;
            while (isWhitespace(text[i])) {i += 1;}
            if (text[i] === "[") {return i;}
        }
        from = idx + 1;
    }
}

export function upsertPluginEntry(text: string, options: Record<string, unknown>): string {
    const nameSpan = findPluginNameSpan(text);

    let quotedName = PLUGIN_QUOTED;

    if (nameSpan) {quotedName = text.slice(nameSpan[0], nameSpan[1]);}

    let entryText = quotedName;

    if (Object.keys(options).length > 0) {entryText = `[${quotedName},${JSON.stringify(options)}]`;}

    const existing = findPluginEntrySpan(text);

    if (existing) {return `${text.slice(0, existing[0])}${entryText}${text.slice(existing[1])}`;}

    const arrayOpen = findPluginArrayOpen(text);

    if (arrayOpen !== null) {
        const arrayClose = findMatching(text, arrayOpen, "[", "]");

        if (arrayClose === -1) {throw new Error("Could not locate the end of the plugin array.");}

        const inner = text.slice(arrayOpen + 1, arrayClose);

        const needsComma = inner.trim() !== "" && !inner.trimEnd().endsWith(",");

        let joined = text.slice(0, arrayClose);

        if (needsComma) {joined += ",";}
        if (inner.trim() !== "") {joined += " ";}
        return joined + entryText + text.slice(arrayClose);
    }

    const objectOpen = text.indexOf("{");

    if (objectOpen === -1) {throw new Error("Could not locate the top-level object of the config file.");}

    const objectClose = findMatching(text, objectOpen, "{", "}");

    if (objectClose === -1) {throw new Error("Could not locate the top-level object of the config file.");}

    const head = text.slice(objectOpen + 1, objectClose).trimEnd();

    const tail = text.slice(objectClose);

    const needsComma = head.trim() !== "" && !head.trimEnd().endsWith(",");

    let result = `${text.slice(0, objectOpen + 1)}${head}`;

    if (needsComma) {result += ",";}
    return `${result}\n  "plugin": [${entryText}]\n${tail}`;
}
