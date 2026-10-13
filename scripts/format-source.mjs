import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { __debug, format, resolveConfig } from 'prettier';

const checkOnly = process.argv.includes('--check');
const rootFiles = ['app.ts', 'vite.config.ts'];
const sourceDirectories = ['src', 'tests'];

async function findCodeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findCodeFiles(path);
    return /\.(js|ts)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

function addSpacingAfterMultilineCalls(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(/^([\t ]*\);\r?\n)(?!\r?\n)/gm, `$1${newline}`);
}

function applyEdits(source, edits) {
  return edits
    .sort((first, second) => second.position - first.position)
    .reduce(
      (result, edit) =>
        `${result.slice(0, edit.position)}${edit.text}${result.slice(edit.position)}`,
      source
    );
}

async function parseSource(source, file) {
  const parser = file.endsWith('.js') ? 'babel' : 'typescript';
  return (await __debug.parse(source, { parser })).ast;
}

async function addConditionalBraces(source, file) {
  const ast = await parseSource(source, file);
  const edits = [];
  const wrap = statement => {
    if (statement.type === 'BlockStatement' || !Array.isArray(statement.range)) return;
    edits.push({ position: statement.range[0], text: '{ ' });
    edits.push({ position: statement.range[1], text: ' }' });
  };

  const visit = node => {
    if (node.type === 'IfStatement') {
      wrap(node.consequent);
      if (node.alternate && node.alternate.type !== 'IfStatement') {
        wrap(node.alternate);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'range') continue;
      if (Array.isArray(value)) value.forEach(child => child?.type && visit(child));
      else if (value?.type) visit(value);
    }
  };

  visit(ast);
  return applyEdits(source, edits);
}

async function addSpacingAfterReturns(source, file) {
  const ast = await parseSource(source, file);
  const edits = [];
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const hasBlankLineAfter = end => /^\r?\n[\t ]*\r?\n/.test(source.slice(end));
  const endsWithReturn = statement => {
    if (statement.type === 'ReturnStatement') return true;
    if (statement.type !== 'BlockStatement' || !statement.body.length) return false;
    return endsWithReturn(statement.body.at(-1));
  };

  const visit = node => {
    const statements = node.type === 'Program' || node.type === 'BlockStatement'
      ? node.body
      : node.type === 'SwitchCase' ? node.consequent : null;

    if (statements) {
      for (let index = 0; index < statements.length - 1; index++) {
        const statement = statements[index];
        const nextStatement = statements[index + 1];
        if (!Array.isArray(statement.range) || !Array.isArray(nextStatement.range)) continue;
        const returnEndsHere = statement.type === 'ReturnStatement' ||
          (statement.type === 'IfStatement' &&
            (endsWithReturn(statement.consequent) ||
              (statement.alternate && endsWithReturn(statement.alternate))));

        if (returnEndsHere && !hasBlankLineAfter(statement.range[1])) {
          edits.push({ position: statement.range[1], text: newline });
        }
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'range') continue;
      if (Array.isArray(value)) value.forEach(child => child?.type && visit(child));
      else if (value?.type) visit(value);
    }
  };

  visit(ast);
  return applyEdits(source, edits);
}

function keepAssignmentValuesBesideEquals(source) {
  return source.replace(
    /^([^\r\n]*?)(?<![=!<>])=(?![=>])([\t ]*)\r?\n[\t ]+(?=\S)/gm,
    '$1= '
  );
}

const files = [
  ...rootFiles,
  ...(await Promise.all(sourceDirectories.map(findCodeFiles))).flat()
];
let hasUnformattedFiles = false;

for (const file of files) {
  const path = resolve(file);
  const source = await readFile(path, 'utf8');
  const options = await resolveConfig(path);
  const formatted = await format(source, {
    ...options,
    endOfLine: source.includes('\r\n') ? 'crlf' : 'lf',
    filepath: path
  });
  const withBraces = await addConditionalBraces(formatted, file);
  const prettifiedBraces = await format(withBraces, {
    ...options,
    endOfLine: source.includes('\r\n') ? 'crlf' : 'lf',
    filepath: path
  });
  const withReturnSpacing = await addSpacingAfterReturns(prettifiedBraces, file);
  const withAssignments = keepAssignmentValuesBesideEquals(withReturnSpacing);
  const expected = addSpacingAfterMultilineCalls(withAssignments);

  if (checkOnly) {
    if (expected !== source) {
      console.error(`${file} needs formatting`);
      hasUnformattedFiles = true;
    }
  } else if (expected !== source) {
    await writeFile(path, expected, 'utf8');
    console.log(`Formatted ${file}`);
  }
}

if (hasUnformattedFiles) process.exitCode = 1;