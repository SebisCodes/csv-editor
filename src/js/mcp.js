/**
 * WebMCP: the editor offers its functions as tools to an AI agent that runs in the browser
 * (document.modelContext, in Chrome as an early preview). The tools run in this page only -
 * no server, no connector. Browsers without WebMCP skip this. Every change is a normal undo
 * step.
 *
 * Rows are counted from 1 = the first data row (row 0 is the header row when the table has
 * one); columns by number from 1 or by header name. list_files, open_file and new_file reach
 * the user's other documents. The tool names, descriptions and parameters are the contract
 * with the agents and stay as they are.
 *
 * createMcp() runs these steps:
 *   1. find WebMCP; without it, return null;
 *   2. wrap every tool so a call notes its time and tells the editor;
 *   3. register the tools;
 *   4. return { last() }, when an agent last used a tool (for the AI status in aistatus.js).
 */

/**
 * What the editor hands to createMcp(); the functions throw an Error with a message for
 * the agent when a call cannot be done.
 * @typedef {object} McpEditor
 * @property {function(): void} [onUse] - a tool was called.
 * @property {function(): object} getState - what the agent sees: name, about, sel and the CSV.
 * @property {function(): Array<{line: number, kind: string, msg: string}>} getProblems - the problems.
 * @property {function(number, number): object} getRows - the header and the rows of a range.
 * @property {function(*, *, string): string} setCell - sets a cell; returns the answer.
 * @property {function((Array|string)): string} addRows - adds rows at the end; returns the answer.
 * @property {function(): Array<{name: string, updated: number, open: boolean}>} getFiles - the documents.
 * @property {function(string): boolean} openFileByName - opens a document by name; false when there is none.
 * @property {function(string, string): (string|null)} createFile - makes and opens a document; its name, null when storage is full.
 * @property {function(string, string, object): Promise<void>} receiveDocument - takes a whole document.
 * @property {function(): void} undo - undoes the last change.
 */

/**
 * What createMcp() returns, read by the AI status.
 * @typedef {object} McpStatus
 * @property {function(): number} last - when an agent last used a tool (milliseconds since 1970), 0 for never.
 */

/**
 * Registers the editor's WebMCP tools (an initializeX: it returns the status object).
 * @param {McpEditor} editor - what the tools need of the editor.
 * @returns {McpStatus|null} the status, null without WebMCP.
 */
export function createMcp(editor) {
    const modelContext = document.modelContext || navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== 'function') return null;
    let lastCall = 0;
    for (const tool of createTools(editor)) {
        const run = tool.execute;
        /**
         * Runs the tool after noting the call for the AI status.
         * @param {...*} args - the tool's arguments.
         * @returns {Promise<*>} the tool's answer.
         */
        tool.execute = async (...args) => { lastCall = Date.now(); editor.onUse?.(); return run(...args); };
        addTool(modelContext, tool);
    }
    return { last: () => lastCall };
}

/**
 * Registers one tool; a tool the browser refuses is left out.
 * @param {object} modelContext - the browser's WebMCP object.
 * @param {object} tool - the tool.
 * @returns {void}
 */
function addTool(modelContext, tool) {
    try {
        const result = modelContext.registerTool(tool);
        if (result && typeof result.catch === 'function') result.catch(() => { /* not available on this page */ });
    } catch (e) { /* the browser refused this tool */ }
}

/**
 * Creates the tools with their descriptions, input schemas and functions.
 * @param {McpEditor} editor - what the tools need of the editor.
 * @returns {object[]} the tools in the order they are registered.
 */
function createTools(editor) {
    return [
        {
            name: 'get_document',
            description: 'Returns the name of the CSV document open in the editor, how it is read (separator, header row), its size and the CSV text (long files are cut - use get_rows for the rest).',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getDocument,
        },
        {
            name: 'get_problems',
            description: 'Lists the problems the editor finds: rows with a different number of fields, unclosed quotes, empty or repeated header names.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true },
            execute: getProblems,
        },
        {
            name: 'get_rows',
            description: 'Returns data rows as JSON: the header names and the rows from "from" to "to" (row numbers from 1, at most 500 at a time).',
            inputSchema: {
                type: 'object',
                properties: { from: { type: 'number', description: 'First row (1 = first data row).' }, to: { type: 'number', description: 'Last row.' } },
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getRows,
        },
        {
            name: 'set_cell',
            description: 'Sets the value of one cell. The CSV text is changed only in that field (quoted when needed).',
            inputSchema: {
                type: 'object',
                properties: {
                    row: { type: 'number', description: 'Row number: 1 = first data row, 0 = the header row.' },
                    column: { type: ['number', 'string'], description: 'Column number from 1, or the header name.' },
                    value: { type: 'string', description: 'The new value.' },
                },
                required: ['row', 'column', 'value'],
            },
            execute: setCell,
        },
        {
            name: 'add_rows',
            description: 'Adds rows at the end of the table: an array of rows (each an array of values), or CSV text without the header row.',
            inputSchema: {
                type: 'object',
                properties: { rows: { type: ['array', 'string'], description: 'Rows as arrays of values, or CSV text.', items: { type: 'array', items: { type: 'string' } } } },
                required: ['rows'],
            },
            execute: addRows,
        },
        {
            name: 'set_document',
            description: 'Replaces the whole open document with new CSV text. Keep the user\'s data unless asked otherwise.',
            inputSchema: { type: 'object', properties: { csv: { type: 'string', description: 'The complete CSV text.' } }, required: ['csv'] },
            execute: setDocument,
        },
        {
            name: 'undo',
            description: 'Undoes the last change in the editor.',
            inputSchema: { type: 'object', properties: {} },
            execute: undo,
        },
        {
            name: 'list_files',
            description: 'Lists the user\'s documents stored in the editor ("My documents"), most recently changed first, and which one is open.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getFileList,
        },
        {
            name: 'open_file',
            description: 'Opens one of the user\'s documents by name; the other tools then work on it.',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name from list_files.' } }, required: ['name'] },
            execute: openFile,
        },
        {
            name: 'new_file',
            description: 'Creates a new document and opens it; the user\'s other documents stay unchanged.',
            inputSchema: {
                type: 'object',
                properties: { name: { type: 'string', description: 'A short name for the document.' }, csv: { type: 'string', description: 'Optional: the CSV text.' } },
                required: ['name'],
            },
            execute: createFile,
        },
    ];

    /**
     * get_document: the open document and how it is read.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function getDocument() {
        const state = editor.getState();
        return `Document: "${state.name}"\n${state.about}\n${state.sel ? `Selected: ${state.sel}\n` : ''}\n${state.csv}`;
    }

    /**
     * get_problems: the problems with their lines.
     * @returns {Promise<string>} one problem per line, or "No problems.".
     */
    async function getProblems() {
        const problems = editor.getProblems();
        return problems.length ? problems.map(problem => `line ${problem.line} (${problem.kind}): ${problem.msg}`).join('\n') : 'No problems.';
    }

    /**
     * get_rows: a range of data rows as JSON.
     * @param {object} input - the first and last row number.
     * @returns {Promise<string>} the header, the total and the rows as JSON.
     */
    async function getRows({ from, to }) {
        return JSON.stringify(editor.getRows(Math.max(1, Math.round(+from || 1)), Math.round(+to || 0)));
    }

    /**
     * set_cell: the value of one cell.
     * @param {object} input - the row, the column and the new value.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function setCell({ row, column, value }) {
        return editor.setCell(row, column, String(value ?? ''));
    }

    /**
     * add_rows: rows at the end of the table.
     * @param {object} input - the rows as arrays of values or as CSV text.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function addRows({ rows }) {
        return editor.addRows(rows);
    }

    /**
     * set_document: a whole new text for the open document.
     * @param {object} input - the complete CSV text.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the text is empty.
     */
    async function setDocument({ csv }) {
        if (!String(csv || '').trim()) throw new Error('The document is empty.');
        editor.receiveDocument(String(csv), 'replace', { direct: true });
        const count = editor.getProblems().length;
        return count ? `Loaded, with ${count} problem(s) - see get_problems.` : 'The document is in the editor.';
    }

    /**
     * undo: the last change undone.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function undo() {
        editor.undo();
        return 'Undone.';
    }

    /**
     * list_files: the user's documents, the open one marked.
     * @returns {Promise<string>} one document per line.
     */
    async function getFileList() {
        return editor.getFiles().map(file => `${file.open ? '* ' : '  '}"${file.name}" (changed ${new Date(file.updated).toISOString().slice(0, 16).replace('T', ' ')})`).join('\n') + '\n(* = open now)';
    }

    /**
     * open_file: one of the user's documents.
     * @param {object} input - the document's name.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when there is no document of that name.
     */
    async function openFile({ name }) {
        if (!editor.openFileByName(name)) throw new Error(`No document "${name}" - call list_files.`);
        return `"${name}" is open.`;
    }

    /**
     * new_file: a new document, opened.
     * @param {object} input - its name and optional text.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the browser storage is full.
     */
    async function createFile({ name, csv }) {
        const createdName = editor.createFile(name, csv);
        if (!createdName) throw new Error('The browser storage is full.');
        return `New document "${createdName}" is open.`;
    }
}
