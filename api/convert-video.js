import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function getInputExtension(fileName = '', mimeType = '') {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  if (lowerName.endsWith('.mp4') || lowerMime.includes('mp4')) return 'mp4';
  if (lowerName.endsWith('.mov') || lowerMime.includes('quicktime')) return 'mov';
  if (lowerName.endsWith('.m4v')) return 'm4v';
  if (lowerName.endsWith('.webm') || lowerMime.includes('webm')) return 'webm';
  return 'bin';
}

function buildOutputFileName(fileName = 'clip.webm') {
  const safeName = path.basename(fileName || 'clip.webm');
  const baseName = safeName.includes('.') ? safeName.replace(/\.[^.]+$/u, '') : safeName;
  return `${baseName || 'clip'}.mp4`;
}

export async function handleConvertVideoRequest(input) {
  if ((input.method || 'POST') !== 'POST') {
    return { status: 405, headers: { 'Content-Type': 'application/json' }, body: Buffer.from(JSON.stringify({ error: 'Method not allowed.' })) };
  }

  const bodyBuffer = input.bodyBuffer;
  if (!bodyBuffer || !bodyBuffer.length) {
    return { status: 400, headers: { 'Content-Type': 'application/json' }, body: Buffer.from(JSON.stringify({ error: 'Video body is required.' })) };
  }

  const fileName = typeof input.query?.fileName === 'string' ? input.query.fileName : 'clip.webm';
  const mimeType = typeof input.query?.mimeType === 'string' ? input.query.mimeType : 'video/webm';
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tudtor-convert-'));
  const inputPath = path.join(tempDir, `input.${getInputExtension(fileName, mimeType)}`);
  const outputFileName = buildOutputFileName(fileName);
  const outputPath = path.join(tempDir, outputFileName);

  try {
    await writeFile(inputPath, bodyBuffer);
    await execFileAsync('/usr/bin/avconvert', [
      '--source',
      inputPath,
      '--output',
      outputPath,
      '--preset',
      'PresetHighestQuality',
      '--replace',
    ]);

    const outputBuffer = await readFile(outputPath);
    return {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'X-Output-File-Name': outputFileName,
      },
      body: outputBuffer,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video conversion failed.';
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify({ error: message })),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
