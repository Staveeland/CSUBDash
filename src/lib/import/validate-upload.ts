export type QueueUploadInput = {
  file_name?: string
  storage_path?: string
  storage_bucket?: string
  file_size_bytes?: number | null
}

type ValidationSuccess = {
  ok: true
  normalized: {
    fileName: string
    storagePath: string
    storageBucket: string
    fileSizeBytes: number
  }
}

type ValidationFailure = {
  ok: false
  status: number
  error: string
}

export type QueueUploadValidation = ValidationSuccess | ValidationFailure

function hasPathTraversal(input: string): boolean {
  return input.includes('..') || input.startsWith('/') || input.startsWith('\\')
}

function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.')
  if (parts.length < 2) return ''
  return `.${parts[parts.length - 1]}`
}

export function validateQueuedUploadInput(
  payload: QueueUploadInput,
  options: { allowedExtensions: string[]; maxBytes: number }
): QueueUploadValidation {
  const fileName = payload.file_name?.trim()
  const storagePath = payload.storage_path?.trim()
  const storageBucket = payload.storage_bucket?.trim() || 'imports'
  const fileSizeBytes = payload.file_size_bytes

  if (!fileName || !storagePath) {
    return { ok: false, status: 400, error: 'Missing file_name or storage_path' }
  }

  if (fileName.length > 255) {
    return { ok: false, status: 400, error: 'Invalid file_name: too long' }
  }

  if (storagePath.length > 1024 || hasPathTraversal(storagePath)) {
    return { ok: false, status: 400, error: 'Invalid storage_path' }
  }

  if (storageBucket !== 'imports') {
    return { ok: false, status: 400, error: 'Invalid storage_bucket' }
  }

  if (typeof fileSizeBytes !== 'number' || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return { ok: false, status: 400, error: 'Missing or invalid file_size_bytes' }
  }

  if (fileSizeBytes > options.maxBytes) {
    return { ok: false, status: 413, error: `File too large. Maximum allowed is ${Math.round(options.maxBytes / 1024 / 1024)}MB` }
  }

  const extension = getExtension(fileName)
  const allowed = options.allowedExtensions.map((value) => value.toLowerCase())
  if (!allowed.includes(extension)) {
    return { ok: false, status: 415, error: `Invalid file type. Allowed: ${allowed.join(', ')}` }
  }

  return {
    ok: true,
    normalized: {
      fileName,
      storagePath,
      storageBucket,
      fileSizeBytes,
    },
  }
}
