import { FileValidator } from '@nestjs/common';
import { FileDto } from '../types';

export interface FileTypeValidatorOptions {
    allowedMimeTypes: string[];
}

/**
 * Validates uploaded file MIME types against an allowlist.
 * Prevents uploading of executables, scripts, and other potentially dangerous files.
 */
export class FileTypeValidator extends FileValidator<FileTypeValidatorOptions> {
    buildErrorMessage(): string {
        return `File type not allowed. Allowed types: ${this.validationOptions.allowedMimeTypes.join(', ')}`;
    }

    isValid(file?: FileDto): boolean {
        if (!file) {
            return false;
        }

        const { mimetype } = file;

        // Check if the mimetype is in the allowlist
        return this.validationOptions.allowedMimeTypes.includes(mimetype);
    }
}
