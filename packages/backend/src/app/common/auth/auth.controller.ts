import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    UseGuards,
    ConflictException,
    BadRequestException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService, RegisterResponse } from "./services/auth.service";
import { LocalAuthGuard } from "./guards/local.auth.guard";
import { JwtAuthGuard } from "./guards/jwt.auth.guard";
import { CreateUserDto } from "../users/dto/create.user.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ApiBody, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "./decorators/current.user.decorator";
import { User } from "../users/user.entity";

@ApiTags("auth")
@Controller({
    path: "auth",
    version: "1",
})
export class AuthController {
    constructor(private authService: AuthService) {}

    @Get()
    healthCheck(): { status: string } {
        return { status: "ok" };
    }

    /**
     * Logs the user in with email and password
     */
    @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
    @UseGuards(LocalAuthGuard)
    @ApiBody({
        schema: {
            properties: {
                email: {
                    type: "string",
                },
                password: {
                    type: "string",
                },
            },
        },
    })
    @Post("login")
    async login(@CurrentUser() user): Promise<LoginResponse> {
        const accessToken = await this.authService.login({
            user,
        });
        return { accessToken };
    }

    @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 attempts per hour
    @Post("register")
    async register(@Body() createUserDto: CreateUserDto): Promise<RegisterResponse> {
        const response = await this.authService.register(createUserDto);

        if (response["error"]) {
            if (response["error"] === "EMAIL_EXISTS") {
                throw new ConflictException("Email already exists");
            }
            throw new BadRequestException("Registration failed");
        }

        return response;
    }

    @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 attempts per hour
    @Post("invite/:inviteCode")
    async registerWithInvite(
        @Body() createUserDto: CreateUserDto
    ): Promise<RegisterResponse> {
        const response = await this.authService.registerWithInvite(
            createUserDto
        );

        if (response["error"]) {
            if (response["error"] === "EMAIL_EXISTS") {
                throw new ConflictException("Email already exists");
            }
            if (response["error"] === "INVALID_INVITE_CODE") {
                throw new BadRequestException("Invalid invite code");
            }
            throw new BadRequestException("Registration failed");
        }

        return response;
    }

    @UseGuards(JwtAuthGuard)
    @Post("invite/:inviteCode/join")
    async joinInvitation(
        @Param("inviteCode") inviteCode: string,
        @CurrentUser() user: User
    ): Promise<RegisterResponse> {
        const response = await this.authService.joinInvitation({
            inviteCode,
            userId: user.id,
        });

        if (response["error"]) {
            if (response["error"] === "INVALID_INVITE_CODE") {
                throw new BadRequestException("Invalid invite code");
            }
            throw new BadRequestException("Failed to join invitation");
        }

        return response;
    }

    @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 attempts per hour
    @Post("forgot-password")
    async forgotPassword(
        @Body() forgotPasswordDto: ForgotPasswordDto
    ): Promise<{ message: string }> {
        return this.authService.forgotPassword(forgotPasswordDto.email);
    }

    @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 attempts per hour
    @Post("reset-password")
    async resetPassword(
        @Body() resetPasswordDto: ResetPasswordDto
    ): Promise<{ message: string }> {
        try {
            return await this.authService.resetPassword(
                resetPasswordDto.token,
                resetPasswordDto.newPassword
            );
        } catch (error) {
            throw new BadRequestException(error.message);
        }
    }
}

type LoginResponse = {
    accessToken: string;
};
