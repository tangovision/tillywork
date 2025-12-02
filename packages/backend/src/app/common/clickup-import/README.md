# ClickUp Import

Import tasks from ClickUp CSV exports into TillyWork.

## Overview

This module allows you to migrate your ClickUp workspace data into TillyWork. It supports:

- Importing tasks with their full details (name, description, dates, priority, tags)
- Preserving the organizational hierarchy (Spaces, Folders, Lists)
- Importing subtasks as child cards
- Auto-creating missing structures (spaces, lists, stages)
- Preview mode to review changes before importing

## How to Export from ClickUp

1. Open your ClickUp workspace
2. Navigate to **Settings** > **Import/Export**
3. Select **Export** and choose **CSV**
4. Select the data you want to export:
   - Tasks
   - Include subtasks (recommended)
   - Include custom fields
5. Download the CSV file

## API Endpoints

### Preview Import

Preview what will be imported without making any changes.

```
POST /v1/clickup-import/preview
Content-Type: multipart/form-data
Authorization: Bearer <your-token>
```

**Form Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | ClickUp CSV export file |
| `workspaceId` | number | Yes | Target workspace ID |

**Response:**
```json
{
  "totalTasks": 150,
  "spacesToCreate": ["Engineering", "Marketing"],
  "listsToCreate": ["Sprint 23", "Q4 Campaign"],
  "stagesToCreate": ["Open", "In Progress", "Review", "Done"],
  "customFieldsDetected": ["Story Points", "Sprint"],
  "warnings": ["Task 'Bug fix' references parent ID abc123 which is not in the export"],
  "sampleTasks": [
    {
      "Task ID": "abc123",
      "Task Name": "Implement feature X",
      "Status": "In Progress",
      "Priority": "High"
    }
  ]
}
```

### Execute Import

Import the ClickUp data into TillyWork.

```
POST /v1/clickup-import/import
Content-Type: multipart/form-data
Authorization: Bearer <your-token>
```

**Form Fields:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `file` | File | Yes | - | ClickUp CSV export file |
| `workspaceId` | number | Yes | - | Target workspace ID |
| `cardTypeId` | number | Yes | - | Card type ID for imported cards |
| `spaceId` | number | No | - | Target space (uses existing or creates from CSV) |
| `listId` | number | No | - | Target list (uses existing or creates from CSV) |
| `createMissingStructures` | boolean | No | `true` | Auto-create spaces, lists, and stages |
| `importSubtasks` | boolean | No | `true` | Import subtasks as child cards |

**Response:**
```json
{
  "success": true,
  "totalTasks": 150,
  "importedCards": 148,
  "skippedTasks": 2,
  "createdSpaces": 2,
  "createdLists": 5,
  "createdStages": 4,
  "errors": [
    {
      "taskId": "xyz789",
      "taskName": "Empty task",
      "message": "Task name is empty"
    }
  ],
  "warnings": [],
  "cardIdMap": {
    "abc123": 456,
    "def456": 457
  }
}
```

## Usage Examples

### Using cURL

**Preview:**
```bash
curl -X POST "http://localhost:3000/v1/clickup-import/preview" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@clickup-export.csv" \
  -F "workspaceId=1"
```

**Import:**
```bash
curl -X POST "http://localhost:3000/v1/clickup-import/import" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@clickup-export.csv" \
  -F "workspaceId=1" \
  -F "cardTypeId=1" \
  -F "createMissingStructures=true" \
  -F "importSubtasks=true"
```

### Using JavaScript/Fetch

```javascript
const formData = new FormData();
formData.append('file', csvFile);
formData.append('workspaceId', '1');
formData.append('cardTypeId', '1');

const response = await fetch('/v1/clickup-import/import', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
console.log(`Imported ${result.importedCards} of ${result.totalTasks} tasks`);
```

## Data Mapping

### Supported ClickUp Fields

| ClickUp Field | TillyWork Field | Notes |
|---------------|-----------------|-------|
| Task Name | Card Title | Required |
| Task Content | Card Description | Stored as rich text |
| Status | List Stage | Auto-created if missing |
| Priority | Priority field | Normalized to: urgent, high, normal, low |
| Due Date | due_date | Supports Unix timestamp and text format |
| Start Date | start_date | Supports Unix timestamp and text format |
| Tags | tags | Parsed as array |
| Space Name | Space | Auto-created if missing |
| List Name | List | Auto-created if missing |
| Parent ID | Parent Card | Links subtasks to parent cards |

### Priority Mapping

| ClickUp Priority | TillyWork Priority |
|------------------|-------------------|
| Urgent | urgent |
| High | high |
| Normal | normal |
| Low | low |

### Stage Auto-Detection

The importer automatically detects completed statuses based on keywords:
- done
- complete/completed
- closed
- resolved
- finished

## Import Behavior

### Structure Creation

When `createMissingStructures` is enabled (default):

1. **Spaces**: Created if they don't exist in the workspace
2. **Lists**: Created within the appropriate space
3. **Stages**: Created within each list with auto-assigned colors

### Default Fallbacks

If structure information is missing from the CSV:

- Tasks without a Space go into "Imported from ClickUp" space
- Tasks without a List go into "Imported Tasks" list
- Tasks without a Status get the default "To Do" stage

### Transaction Safety

The import runs in a database transaction:
- If any critical error occurs, all changes are rolled back
- Individual task failures don't abort the entire import
- Errors are collected and returned in the result

## Limitations

- **Attachments**: URLs are stored but files are not downloaded
- **Assignees**: Stored in data but not linked to TillyWork users
- **Custom Fields**: Detected but not auto-mapped to TillyWork fields
- **Time Tracking**: Stored in data but not mapped to TillyWork time tracking
- **Comments**: Not imported (ClickUp exports don't include full comment data)

## Troubleshooting

### 403 Forbidden: Insufficient permissions

You need at least Editor access to the target workspace.

### 400 Bad Request: No tasks found

The CSV file is empty or doesn't contain valid ClickUp task data.

### 404 Not Found: Workspace/Card Type not found

Verify the workspace ID and card type ID exist and you have access to them.

### Some tasks were skipped

Check the `errors` array in the response for details. Common reasons:
- Empty task name
- Malformed data in the CSV
- Parent task not found for subtask

## File Size Limits

- Maximum file size: 50MB
- Maximum tasks per import: No hard limit, but large imports may be slow

## Related

- [Cards API](../cards/README.md)
- [Lists API](../lists/README.md)
- [Workspaces API](../workspaces/README.md)
