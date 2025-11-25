import { IsOptional, IsString, MinLength, Matches, Length } from 'class-validator';

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
    @Matches(/^\+?[1-9]\d{1,14}$/, {
        message: 'Phone number must be in international format (E.164), e.g., +1234567890',
    })
    phoneNumber?: string;

    @IsOptional()
    @IsString()
    @Length(2, 2, {
        message: 'Country must be a 2-letter ISO 3166-1 alpha-2 code',
    })
    @Matches(/^[A-Z]{2}$/, {
        message: 'Country code must be two uppercase letters (ISO 3166-1 alpha-2)',
    })
    country?: string;

    @IsOptional()
    @IsString()
    photo?: string;

    @IsOptional()
    onboarding?: any;
}
