# CSRF Protection Usage Guide

## Overview

This application implements CSRF (Cross-Site Request Forgery) protection using a double-submit cookie pattern. However, **CSRF protection is optional** for most endpoints because the application primarily uses JWT tokens in Authorization headers, which are not susceptible to CSRF attacks.

## When to Use CSRF Protection

Use the `@UseGuards(CsrfGuard)` decorator on endpoints that:

1. **Perform sensitive state-changing operations** (DELETE user, change roles, etc.)
2. **Are accessed by browser clients** that might use cookies
3. **Need additional security** beyond JWT authentication

## When NOT to Use CSRF Protection

Skip CSRF protection (it's not needed) for:

1. **Endpoints using JWT in Authorization headers** (already CSRF-safe)
2. **GET/HEAD/OPTIONS requests** (idempotent operations)
3. **API-only endpoints** used by mobile apps or CLIs
4. **Public endpoints** that don't require authentication

## Usage Examples

### Protecting a Sensitive Endpoint

```typescript
import { UseGuards } from '@nestjs/common';
import { CsrfGuard } from '../guards/csrf.guard';

@Controller('admin')
export class AdminController {
    // CSRF protection enabled for this sensitive operation
    @UseGuards(JwtAuthGuard, CsrfGuard)
    @Delete('user/:id')
    async deleteUser(@Param('id') id: string) {
        // ...
    }
}
```

### Skipping CSRF on Specific Endpoints

```typescript
import { SkipCsrf } from '../decorators/skip-csrf.decorator';

@Controller('data')
export class DataController {
    // Skip CSRF for this public, read-only endpoint
    @SkipCsrf()
    @Get('public')
    async getPublicData() {
        // ...
    }
}
```

## Client Implementation

### Frontend (Browser)

1. **Retrieve CSRF token** from cookie `XSRF-TOKEN`
2. **Include token** in `X-CSRF-Token` header for protected requests

```javascript
// Example with fetch API
const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('XSRF-TOKEN='))
    ?.split('=')[1];

fetch('/api/v1/admin/user/123', {
    method: 'DELETE',
    headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'X-CSRF-Token': csrfToken,
    },
});
```

### Non-Browser Clients

Non-browser clients (mobile apps, CLI tools) **do not need CSRF tokens** if they:
- Use JWT in Authorization headers
- Don't use cookies for authentication

## How It Works

1. **First Request**: Client makes a request without CSRF token → Request succeeds, cookie is set
2. **Subsequent Requests**: Client includes CSRF token from cookie in `X-CSRF-Token` header
3. **Validation**: Guard compares cookie token with header token using timing-safe comparison
4. **Protection**: Malicious sites cannot read the cookie due to Same-Origin Policy

## Security Notes

- **Timing-Safe Comparison**: Uses `crypto.timingSafeEqual()` to prevent timing attacks
- **Random Token Generation**: 32-byte random tokens using `crypto.randomBytes()`
- **JWT Primary Defense**: JWT in Authorization headers is the main CSRF protection
- **Defense in Depth**: CSRF guard provides an additional security layer

## Current Status

**CSRF protection is NOT globally enabled** because:
1. The app uses JWT in Authorization headers (CSRF-safe by design)
2. Adds complexity for API clients
3. Most endpoints don't need it

Enable it selectively on sensitive operations if needed in the future.
