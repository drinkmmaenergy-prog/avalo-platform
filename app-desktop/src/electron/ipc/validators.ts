const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_BATCH_SIZE = 50;
const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime'
];

interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  maxLength?: number;
  maxSize?: number;
  allowedValues?: any[];
  customValidator?: (value: any) => boolean;
}

const channelValidators: Record<string, ValidationRule[]> = {
  'desktop:uploadFiles': [
    {
      type: 'array',
      required: true,
      maxSize: MAX_BATCH_SIZE,
      customValidator: (files: any[]) => {
        return files.every(file =>
          file.name &&
          file.size &&
          file.size <= MAX_FILE_SIZE &&
          file.type &&
          ALLOWED_FILE_TYPES.includes(file.type)
        );
      }
    }
  ],
  'desktop:batchUpload': [
    {
      type: 'array',
      required: true,
      maxSize: MAX_BATCH_SIZE,
      customValidator: (files: any[]) => {
        return files.every(file =>
          file.name &&
          file.size &&
          file.size <= MAX_FILE_SIZE &&
          file.type &&
          ALLOWED_FILE_TYPES.includes(file.type)
        );
      }
    }
  ],
  'desktop:addToOfflineQueue': [
    {
      type: 'object',
      required: true,
      customValidator: (item: any) => {
        return item.type && item.data;
      }
    }
  ],
  'desktop:showNotification': [
    {
      type: 'object',
      required: true,
      customValidator: (notification: any) => {
        return notification.title && notification.body;
      }
    }
  ],
  'desktop:switchAccount': [
    {
      type: 'string',
      required: true,
      maxLength: 200
    }
  ],
  'desktop:exportVideo': [
    {
      type: 'object',
      required: true,
      customValidator: (videoData: any) => {
        return videoData.format && videoData.quality;
      }
    }
  ]
};

export function validateRequest(channelName: string, args: any[]): boolean {
  const validators = channelValidators[channelName];

  if (!validators) {
    return true;
  }

  if (args.length !== validators.length) {
    return false;
  }

  return validators.every((validator, index) => {
    const value = args[index];

    if (validator.required && (value === null || value === undefined)) {
      return false;
    }

    if (value === null || value === undefined) {
      return true;
    }

    if (validator.type === 'array' && !Array.isArray(value)) {
      return false;
    }

    if (validator.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      return false;
    }

    if (validator.type !== 'array' && validator.type !== 'object' && typeof value !== validator.type) {
      return false;
    }

    if (validator.maxLength && typeof value === 'string' && value.length > validator.maxLength) {
      return false;
    }

    if (validator.maxSize && Array.isArray(value) && value.length > validator.maxSize) {
      return false;
    }

    if (validator.allowedValues && !validator.allowedValues.includes(value)) {
      return false;
    }

    if (validator.customValidator && !validator.customValidator(value)) {
      return false;
    }

    return true;
  });
}

export function sanitizeData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return data
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  if (typeof data === 'object') {
    const sanitized: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        sanitized[key] = sanitizeData(data[key]);
      }
    }
    return sanitized;
  }

  return data;
}

export function validateFileUpload(file: any): { valid: boolean; error?: string } {
  if (!file.name || typeof file.name !== 'string') {
    return { valid: false, error: 'Invalid file name' };
  }

  if (!file.size || typeof file.size !== 'number') {
    return { valid: false, error: 'Invalid file size' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size exceeds maximum allowed' };
  }

  if (!file.type || !ALLOWED_FILE_TYPES.includes(file.type)) {
    return { valid: false, error: 'File type not allowed' };
  }

  const dangerousPatterns = [
    /\.exe$/i,
    /\.bat$/i,
    /\.cmd$/i,
    /\.sh$/i,
    /\.scr$/i,
    /\.com$/i
  ];

  if (dangerousPatterns.some(pattern => pattern.test(file.name))) {
    return { valid: false, error: 'Unsafe file extension' };
  }

  return { valid: true };
}

export function validateBatchUpload(files: any[]): { valid: boolean; error?: string; invalidFiles?: string[] } {
  if (!Array.isArray(files)) {
    return { valid: false, error: 'Files must be an array' };
  }

  if (files.length === 0) {
    return { valid: false, error: 'No files provided' };
  }

  if (files.length > MAX_BATCH_SIZE) {
    return { valid: false, error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` };
  }

  const invalidFiles: string[] = [];

  files.forEach((file, index) => {
    const validation = validateFileUpload(file);
    if (!validation.valid) {
      invalidFiles.push(`File ${index + 1}: ${validation.error}`);
    }
  });

  if (invalidFiles.length > 0) {
    return { valid: false, error: 'Some files are invalid', invalidFiles };
  }

  return { valid: true };
}