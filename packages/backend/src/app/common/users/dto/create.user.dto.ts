import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength, Length } from 'class-validator';

export class CreateUserDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    firstName: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    lastName: string;

    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    })
    password: string;

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
    inviteCode?: string;
}
