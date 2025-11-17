# XSS Protection and Sanitization

## Overview

This application includes comprehensive XSS (Cross-Site Scripting) protection through DOMPurify-based sanitization. The sanitization service removes malicious scripts, event handlers, and other XSS vectors from user input.

## Components

### 1. SanitizationService

Core service providing sanitization methods:

```typescript
import { SanitizationService } from '../common/sanitization/sanitization.service';

@Injectable()
export class MyService {
    constructor(private sanitizationService: SanitizationService) {}

    saveUserContent(content: string) {
        // Sanitize HTML content
        const safe = this.sanitizationService.sanitizeHtml(content);
        // ... save to database
    }
}
```

### 2. SanitizePipe

Automatically sanitizes request bodies and query parameters:

```typescript
import { SanitizePipe } from '../common/pipes/sanitize.pipe';

@Controller('posts')
export class PostsController {
    // Sanitize specific parameter
    @Post()
    async create(@Body(SanitizePipe) createDto: CreatePostDto) {
        // createDto is automatically sanitized
    }
}
```

## Sanitization Methods

### sanitizeHtml(dirty, options?)

Removes malicious HTML while preserving safe formatting:

```typescript
const dirty = '<script>alert("XSS")</script><p>Safe content</p>';
const clean = sanitizationService.sanitizeHtml(dirty);
// Result: '<p>Safe content</p>'
```

**Removed elements:**
- `<script>` tags
- `<iframe>`, `<object>`, `<embed>` tags
- Event handlers (onclick, onerror, onload, etc.)
- `javascript:` URLs
- Data URLs with scripts

**Options:**
```typescript
sanitizeHtml(dirty, {
    allowedTags: ['p', 'b', 'i', 'strong', 'em'],
    allowedAttributes: ['class', 'id'],
    allowDataAttributes: false,
});
```

### sanitizePlainText(text)

Escapes HTML entities for plain text:

```typescript
const text = '<script>alert("XSS")</script>';
const escaped = sanitizationService.sanitizePlainText(text);
// Result: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
```

### sanitizeObject(obj)

Recursively sanitizes all string properties in an object:

```typescript
const dirty = {
    title: '<script>XSS</script>Title',
    content: {
        body: '<img src=x onerror=alert(1)>',
        tags: ['<script>tag1</script>', 'tag2'],
    },
};

const clean = sanitizationService.sanitizeObject(dirty);
// All strings are sanitized, structure preserved
```

### sanitizeForLike(input)

Escapes special characters for SQL LIKE queries:

```typescript
const search = '50%_off\\sale';
const safe = sanitizationService.sanitizeForLike(search);
// Result: '50\\%\\_off\\\\sale'
```

## Usage Patterns

### 1. Controller-Level Sanitization

```typescript
@Controller('comments')
export class CommentsController {
    constructor(private sanitizationService: SanitizationService) {}

    @Post()
    async create(@Body() createDto: CreateCommentDto) {
        // Sanitize before processing
        const sanitizedContent = this.sanitizationService.sanitizeHtml(
            createDto.content
        );

        return this.commentsService.create({
            ...createDto,
            content: sanitizedContent,
        });
    }
}
```

### 2. Service-Level Sanitization

```typescript
@Injectable()
export class PostsService {
    constructor(private sanitizationService: SanitizationService) {}

    async create(createDto: CreatePostDto) {
        // Sanitize complex objects
        const sanitized = this.sanitizationService.sanitizeObject(createDto);

        // Save sanitized data
        return this.postsRepository.save(sanitized);
    }
}
```

### 3. JSONB Field Sanitization

```typescript
@Injectable()
export class CardsService {
    constructor(private sanitizationService: SanitizationService) {}

    async update(id: string, data: Record<string, any>) {
        // Sanitize JSONB data before saving
        const sanitizedData = this.sanitizationService.sanitizeObject(data);

        await this.cardsRepository.update(id, {
            data: sanitizedData,
        });
    }
}
```

### 4. Rich Text Editor Content

```typescript
@Injectable()
export class ContentService {
    constructor(private sanitizationService: SanitizationService) {}

    async saveRichText(content: string) {
        // Allow specific tags for rich text while removing scripts
        const safe = this.sanitizationService.sanitizeHtml(content, {
            allowedTags: [
                'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3',
                'ul', 'ol', 'li', 'a', 'blockquote', 'code', 'pre',
            ],
            allowedAttributes: ['href', 'class', 'id'],
        });

        return this.repository.save({ content: safe });
    }
}
```

## When to Sanitize

### ✅ Always Sanitize

1. **User-generated HTML content** (comments, posts, descriptions)
2. **Rich text editor input** (Tiptap, CKEditor, etc.)
3. **JSONB fields with user data** (card data, custom fields)
4. **SVG uploads** (can contain scripts)
5. **User profile information** (bio, about, etc.)

### ⚠️ Consider Sanitizing

1. **File names** (may contain special characters)
2. **Search queries** (use sanitizeForLike for SQL LIKE)
3. **URL parameters** (if rendered in HTML)
4. **Email content** (HTML emails)

### ❌ Don't Sanitize

1. **Passwords** (should be hashed, not sanitized)
2. **API keys/secrets** (should be encrypted)
3. **Internal system data** (not user-facing)
4. **Already sanitized data** (avoid double-sanitization)

## Security Best Practices

### 1. Defense in Depth

Even with sanitization, use Content Security Policy (CSP):

```typescript
// Already configured in main.ts via Helmet
contentSecurityPolicy: {
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],  // No inline scripts
    },
}
```

### 2. Output Encoding

Frontend should also encode output:

```typescript
// Vue 3 automatically escapes {{ }} bindings
<p>{{ userContent }}</p>  // Safe

// Use v-html only with sanitized content
<div v-html="sanitizedHtml"></div>
```

### 3. Validation + Sanitization

Combine validation with sanitization:

```typescript
@IsString()
@MaxLength(1000)
content: string;  // Validated length

// Then sanitize in service:
const safe = sanitizationService.sanitizeHtml(content);
```

## Testing Sanitization

### Test XSS Payloads

```typescript
describe('SanitizationService', () => {
    it('should remove script tags', () => {
        const dirty = '<script>alert("XSS")</script>';
        const clean = service.sanitizeHtml(dirty);
        expect(clean).not.toContain('<script>');
    });

    it('should remove event handlers', () => {
        const dirty = '<img src=x onerror=alert(1)>';
        const clean = service.sanitizeHtml(dirty);
        expect(clean).not.toContain('onerror');
    });

    it('should preserve safe HTML', () => {
        const dirty = '<p><strong>Bold</strong> text</p>';
        const clean = service.sanitizeHtml(dirty);
        expect(clean).toContain('<strong>');
    });
});
```

## Current Implementation Status

- ✅ SanitizationService created with DOMPurify
- ✅ SanitizePipe available for automatic sanitization
- ✅ Module exported globally
- ⚠️ **Not applied globally by default** (opt-in per endpoint)

## Recommended Next Steps

1. **Identify high-risk endpoints** (comments, posts, cards)
2. **Apply SanitizePipe** to those endpoints
3. **Sanitize JSONB fields** in card/list data
4. **Add unit tests** for sanitization logic
5. **Document for developers** which fields need sanitization

## Performance Considerations

- DOMPurify is fast (~1ms per operation)
- Caching of sanitized content recommended for frequently accessed data
- Consider sanitizing on write, not read
- For large JSONB objects, sanitize selectively

## Migration Strategy

For existing data with potential XSS:

```typescript
// One-time migration script
async sanitizeExistingData() {
    const cards = await this.cardsRepository.find();

    for (const card of cards) {
        if (card.data) {
            card.data = this.sanitizationService.sanitizeObject(card.data);
            await this.cardsRepository.save(card);
        }
    }
}
```
