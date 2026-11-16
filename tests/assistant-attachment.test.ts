import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAssistantAttachment } from '../src/lib/assistant-attachment.ts';

const fixtures = [
  ['report.pdf', 'application/pdf', '%PDF-1.7\n'],
  ['image.png', 'image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
  ['image.jpg', 'image/jpeg', new Uint8Array([255, 216, 255])],
  ['image.jpeg', 'image/jpeg', new Uint8Array([255, 216, 255])],
  ['image.webp', 'image/webp', 'RIFF\0\0\0\0WEBP'],
  ['notes.txt', 'text/plain', 'Hello\nworld'],
  ['notes.MD', 'text/markdown', '# Notes'],
  ['report.csv', 'text/csv', 'name,value\na,1'],
  ['data.json', 'application/json', '{"valid":true}'],
] as const;

for (const [name, mimeType, content] of fixtures) {
  test(`resolves empty MIME for ${name}`, async () => {
    const file = new File([content], name);
    const result = await validateAssistantAttachment(file);
    assert.equal(result.file, file);
    assert.equal(result.mimeType, mimeType);
  });
}

test('retains supported browser MIME metadata without requiring an extension', async () => {
  const result = await validateAssistantAttachment(new File(['hello'], 'download', { type: 'text/plain' }));
  assert.equal(result.mimeType, 'text/plain');
});

test('rejects unsupported extensions and MIME metadata', async () => {
  await assert.rejects(validateAssistantAttachment(new File(['hello'], 'file.exe')));
  await assert.rejects(validateAssistantAttachment(new File(['hello'], 'file.txt', { type: 'application/octet-stream' })));
});

test('rejects content mismatches even with supported browser metadata', async () => {
  for (const name of ['fake.pdf', 'fake.png', 'fake.jpg', 'fake.webp']) {
    await assert.rejects(validateAssistantAttachment(new File(['plain text'], name)));
  }
  await assert.rejects(validateAssistantAttachment(new File(['plain text'], 'image.png', { type: 'image/png' })));
  await assert.rejects(validateAssistantAttachment(new File(['not json'], 'data.json')));
  await assert.rejects(validateAssistantAttachment(new File([new Uint8Array([255])], 'data.txt')));
  await assert.rejects(validateAssistantAttachment(new File(['binary\0data'], 'data.md')));
});

test('preserves the inclusive 8 MB size limit', async () => {
  const maximum = 'a'.repeat(8 * 1024 * 1024);
  await validateAssistantAttachment(new File([maximum], 'notes.txt'));
  await assert.rejects(validateAssistantAttachment(new File([maximum, 'a'], 'notes.txt')));
});
