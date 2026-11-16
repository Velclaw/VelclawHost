const mimeByExtension: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
};

export interface AssistantAttachment {
  file: File;
  mimeType: string;
}

export async function validateAssistantAttachment(file: File): Promise<AssistantAttachment> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeType = file.type || mimeByExtension[extension];
  if (!Object.values(mimeByExtension).includes(mimeType) || file.size > 8 * 1024 * 1024) {
    throw new Error('Unsupported file or file exceeds 8 MB');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  let valid: boolean;
  switch (mimeType) {
    case 'application/pdf':
      valid = startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]);
      break;
    case 'image/png':
      valid = startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      break;
    case 'image/jpeg':
      valid = startsWith([0xff, 0xd8, 0xff]);
      break;
    case 'image/webp':
      valid = startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8);
      break;
    default: {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      valid = !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text);
      if (mimeType === 'application/json') JSON.parse(text);
    }
  }
  if (!valid) throw new Error('File content does not match its type');
  return { file, mimeType };
}
