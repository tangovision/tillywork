import { Injectable, Logger } from "@nestjs/common";
import { UsersService } from "../../users/users.service";
import { JwtService } from "@nestjs/jwt";
import { User } from "../../users/user.entity";
import bcrypt from "bcrypt";
import { CreateUserDto } from "../../users/dto/create.user.dto";
import { ProjectsService } from "../../projects/projects.service";
import { CreateProjectDto } from "../../projects/dto/create.project.dto";
import { Project } from "../../projects/project.entity";
import { ProjectUsersService } from "../../projects/project-users/project.users.service";
import { ClsService } from "nestjs-cls";
import { NotificationPreferenceService } from "../../notifications/notification-preference/notification.preference.service";
import { NotificationChannel } from "@tillywork/shared";

export type RegisterResponse =
    | (User & {
          accessToken: string;
      })
    | {
          error: "EMAIL_EXISTS" | "INVALID_INVITE_CODE";
      };

@Injectable()
export class AuthService {
    private readonly logger = new Logger("AuthService");

    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private projectsService: ProjectsService,
        private projectUsersService: ProjectUsersService,
        private clsService: ClsService,
        private notificationPreferenceService: NotificationPreferenceService
    ) {}

    async login({ user }: { user: User }): Promise<string> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...userWithoutPassword } = user;

        const payload = {
            ...userWithoutPassword,
            sub: user.id,
        };
        return this.jwtService.sign(payload);
    }

    async validatePassword(
        password: string,
        savedPassword: string
    ): Promise<boolean> {
        return bcrypt.compare(password, savedPassword);
    }

    async validateUser(
        email: string,
        password: string
    ): Promise<{ user: Omit<User, "password">; project: Project } | null> {
        try {
            const user = await this.usersService.findOneByEmailWithPassword(
                email
            );

            if (!user) {
                return null;
            }

            const isPasswordValid = await this.validatePassword(
                password,
                user.password
            );

            if (!isPasswordValid) {
                return null;
            }

            this.clsService.setIfUndefined("user", user);
            const project = await this.projectsService.findOneBy({
                where: {
                    users: {
                        user: {
                            id: user.id,
                        },
                    },
                },
            });

            return { user, project };
        } catch (error) {
            this.logger.error(error);
            return null;
        }
    }

    async register(createUserDto: CreateUserDto): Promise<RegisterResponse> {
        const emailCheck = await this.usersService.findOneByEmail(
            createUserDto.email
        );

        if (emailCheck) {
            return {
                error: "EMAIL_EXISTS",
            };
        }

        const createdUser = await this.usersService.create(createUserDto);
        await this.notificationPreferenceService.upsert(createdUser.id, {
            channel: NotificationChannel.IN_APP,
            enabled: true,
            config: {},
        });
        const projectDto: CreateProjectDto = {
            name: `${createdUser.firstName}'s Project`,
            ownerId: createdUser.id,
        };
        const project = await this.projectsService.create({
            ...projectDto,
            users: [
                {
                    user: createdUser,
                    role: "owner",
                    project: projectDto as Project,
                },
            ],
        });

        const accessToken = await this.login({
            user: { ...createdUser, project },
        });

        return { ...createdUser, accessToken };
    }

    async registerWithInvite(
        createUserDto: CreateUserDto
    ): Promise<RegisterResponse> {
        const project = await this.projectsService.findOneByInviteCode(
            createUserDto.inviteCode
        );

        if (!project) {
            return {
                error: "INVALID_INVITE_CODE",
            };
        }

        const emailCheck = await this.usersService.findOneByEmail(
            createUserDto.email
        );

        if (emailCheck) {
            return {
                error: "EMAIL_EXISTS",
            };
        }

        const createdUser = await this.usersService.create(createUserDto);
        await this.notificationPreferenceService.upsert(createdUser.id, {
            channel: NotificationChannel.IN_APP,
            enabled: true,
            config: {},
        });
        await this.projectUsersService.create({
            user: createdUser,
            project,
            role: "admin",
        });

        const accessToken = await this.login({
            user: { ...createdUser, project },
        });

        return { ...createdUser, accessToken };
    }

    async joinInvitation({
        inviteCode,
        userId,
    }: {
        inviteCode: string;
        userId: number;
    }): Promise<RegisterResponse> {
        const project = await this.projectsService.findOneBy({
            where: { inviteCode },
        });

        if (!project) {
            return {
                error: "INVALID_INVITE_CODE",
            };
        }

        const user = await this.usersService.findOne(userId);

        await this.projectUsersService.create({
            user,
            project,
            role: "admin",
        });

        const accessToken = await this.login({
            user: { ...user, project },
        });

        return { ...user, accessToken };
    }
}

    async forgotPassword(email: string): Promise<{ message: string }> {
        const user = await this.usersService.findOneByEmail(email);
        
        if (!user) {
            // Don't reveal if email exists for security (timing attack prevention)
            return { message: "If the email exists, a password reset link will be sent" };
        }

        // Generate secure random token
        const crypto = await import('crypto');
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        // Hash the token before storing (never store plain tokens)
        const hashedToken = await bcrypt.hash(resetToken, 10);
        
        // Token expires in 1 hour
        const resetTokenExpiry = new Date();
        resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);

        // Update user with reset token and expiry
        await this.usersService.updateResetToken(user.id, hashedToken, resetTokenExpiry);

        // TODO: Send email with resetToken
        // In production, you would send an email here with a link like:
        // ${FRONTEND_URL}/reset-password?token=${resetToken}
        
        this.logger.log(`Password reset requested for user ${user.id}`);
        
        return { message: "If the email exists, a password reset link will be sent" };
    }

    async resetPassword(
        token: string,
        newPassword: string
    ): Promise<{ message: string }> {
        const users = await this.usersService.findUsersWithResetTokens();

        let matchedUser: User | null = null;

        // Find user by comparing hashed tokens
        for (const user of users) {
            if (!user.resetToken || !user.resetTokenExpiry) continue;

            const isValidToken = await bcrypt.compare(token, user.resetToken);
            if (isValidToken) {
                matchedUser = user;
                break;
            }
        }

        if (!matchedUser) {
            throw new Error("Invalid or expired reset token");
        }

        // Check if token has expired
        if (new Date() > matchedUser.resetTokenExpiry) {
            throw new Error("Invalid or expired reset token");
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear reset token
        await this.usersService.updatePasswordAndClearResetToken(
            matchedUser.id,
            hashedPassword
        );

        this.logger.log(`Password successfully reset for user ${matchedUser.id}`);

        return { message: "Password has been successfully reset" };
    }
