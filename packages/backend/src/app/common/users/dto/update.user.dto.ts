import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * DTO for updating user profile information.
 * Only includes safe fields that users should be allowed to modify.
 * Sensitive fields like roles, password, and email are excluded.
 */
export class UpdateUserDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    firstName?: string;

    @IsOptional()
    @IsString()
    @MinLength(1)
    lastName?: string;

    @IsOptional()
    @IsString()
    phoneNumber?: string;

    @IsOptional()
    @IsString()
    country?: string;

    @IsOptional()
    @IsString()
    photo?: string;

    @IsOptional()
    onboarding?: any;
}
