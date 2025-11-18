import { FileValidator } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { FileDto } from '../types';

export interface FileTypeValidatorOptions {
    allowedMimeTypes: string[];
}

/**
 * Validates uploaded file MIME types against an allowlist using magic number verification.
 *
 * Security features:
 * 1. Checks claimed MIME type against allowlist
 * 2. Verifies actual file content using magic numbers
 * 3. Ensures claimed type matches actual content
 *
 * This prevents attackers from:
 * - Uploading executables with fake .jpg extension
 * - Spoofing MIME types to bypass filters
 * - Exploiting file type confusion vulnerabilities
 */
export class FileTypeValidator extends FileValidator<FileTypeValidatorOptions> {
    buildErrorMessage(): string {
        return `File type not allowed. Allowed types: ${this.validationOptions.allowedMimeTypes.join(', ')}`;
    }

    async isValid(file?: FileDto): Promise<boolean> {
        if (!file) {
            return false;
        }

        const { mimetype, buffer } = file;

        // First check: Validate claimed MIME type is in allowlist
        if (!this.validationOptions.allowedMimeTypes.includes(mimetype)) {
            return false;
        }

        // Second check: Verify actual file content using magic numbers
        // This prevents MIME type spoofing
        if (buffer) {
            try {
                const detectedType = await fileTypeFromBuffer(buffer);

                // If we can detect the file type, verify it matches the claimed type
                if (detectedType) {
                    // Check if detected MIME type is in our allowlist
                    if (!this.validationOptions.allowedMimeTypes.includes(detectedType.mime)) {
                        // File content doesn't match an allowed type
                        return false;
                    }

                    // Additional check: Ensure claimed type roughly matches detected type
                    // This prevents uploading malicious.exe renamed to malicious.jpg
                    const claimedCategory = mimetype.split('/')[0];
                    const detectedCategory = detectedType.mime.split('/')[0];

                    if (claimedCategory !== detectedCategory) {
                        // MIME type category mismatch (e.g., claiming image/* but actually application/*)
                        return false;
                    }
                }
                // If we can't detect the type (e.g., plain text files), trust the claimed type
                // since it passed the allowlist check
            } catch (error) {
                // If magic number detection fails, reject the file to be safe
                return false;
            }
        }

        return true;
    }
}

