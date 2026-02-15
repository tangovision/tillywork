const fs = require('fs');
const path = require('path');
const https = require('https');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API_URL = 'https://tillywork.tangovision.dev/api/v1';
const EMAIL = 'pavel@tango.vision';
const PASSWORD = 'Hhhu35WL';
const FILE_PATH = '/Users/PvUtrix_1/Apps/_Tango.Vision/refactor2.0/tv-platform/tillywork/clickup/4602024UatpzUfO.csv';

async function main() {
  try {
    // 1. Login
    console.log('Logging in...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed: ${loginRes.status} ${loginRes.statusText} - ${await loginRes.text()}`);
    }

    const { accessToken } = await loginRes.json();
    console.log('Login successful.');

    // 2. Fetch Workspaces
    console.log('Fetching workspaces...');
    const workspacesRes = await fetch(`${API_URL}/workspaces`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!workspacesRes.ok) {
        throw new Error(`Failed to fetch workspaces: ${await workspacesRes.text()}`);
    }

    const workspaces = await workspacesRes.json();
    if (workspaces.length === 0) {
      throw new Error('No workspaces found.');
    }
    const workspace = workspaces[0];
    console.log(`Using Workspace: ${workspace.name} (ID: ${workspace.id})`);

    // 3. Fetch Card Types
    console.log('Fetching card types...');
    const cardTypesRes = await fetch(`${API_URL}/card-types?workspaceId=${workspace.id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!cardTypesRes.ok) {
        throw new Error(`Failed to fetch card types: ${await cardTypesRes.text()}`);
    }

    const cardTypes = await cardTypesRes.json();
    // Try to find "Task" or "Issue", otherwise default to first
    let cardType = cardTypes.find(ct => ct.name.toLowerCase() === 'task') || cardTypes[0];
    console.log(`Using Card Type: ${cardType.name} (ID: ${cardType.id})`);

    // 4. Pre-create Space and List to avoid transaction bug
    console.log('Creating "ClickUp Import 2" Space...');
    const spaceRes = await fetch(`${API_URL}/spaces`, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: 'ClickUp Import 2',
            workspaceId: workspace.id,
            color: '#10b981',
            icon: 'mdi-import'
        })
    });
    
    if (!spaceRes.ok) {
        throw new Error(`Failed to create space: ${await spaceRes.text()}`);
    }
    const space = await spaceRes.json();
    console.log(`Created Space: ${space.name} (ID: ${space.id})`);

    console.log('Creating "Imported Tasks 2" List...');
    const listRes = await fetch(`${API_URL}/lists`, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: 'Imported Tasks 2',
            workspaceId: workspace.id,
            spaceId: space.id,
            type: 'default_list',
            defaultCardType: { id: cardType.id },
            createDefaultStages: true
        })
    });

    if (!listRes.ok) {
        throw new Error(`Failed to create list: ${await listRes.text()}`);
    }
    const list = await listRes.json();
    console.log(`Created List: ${list.name} (ID: ${list.id})`);

    // 4a. Ensure _clickup_import field exists to prevent CardSubscriber crash
    console.log('Ensuring _clickup_import field exists...');
    const fieldsRes = await fetch(`${API_URL}/fields?workspaceId=${workspace.id}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (fieldsRes.ok) {
        const fields = await fieldsRes.json();
        const existingField = fields.find(f => f.slug === '_clickup_import' && f.cardType?.id === cardType.id);
        
        if (!existingField) {
            console.log('Creating _clickup_import field...');
            const createFieldRes = await fetch(`${API_URL}/fields`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: 'ClickUp Import Data',
                    slug: '_clickup_import',
                    type: 'text',
                    icon: 'mdi-database-import',
                    workspaceId: workspace.id,
                    cardType: { id: cardType.id }
                })
            });
            
            if (!createFieldRes.ok) {
                console.warn(`Failed to create _clickup_import field: ${await createFieldRes.text()}`);
            } else {
                console.log('Created _clickup_import field.');
            }
        } else {
             console.log('_clickup_import field already exists.');
        }
    } else {
        console.warn('Failed to fetch fields, skipping _clickup_import check.');
    }

    // 5. Import
    console.log(`Importing file: ${FILE_PATH}`);
    const fileContent = fs.readFileSync(FILE_PATH);
    const blob = new Blob([fileContent], { type: 'text/csv' });
    
    const formData = new FormData();
    formData.append('file', blob, path.basename(FILE_PATH));
    formData.append('workspaceId', workspace.id.toString());
    formData.append('cardTypeId', cardType.id.toString());
    formData.append('spaceId', space.id.toString());
    formData.append('listId', list.id.toString());
    formData.append('createMissingStructures', 'false');
    formData.append('importSubtasks', 'true');

    console.log('Sending import request...');
    const importRes = await fetch(`${API_URL}/clickup-import/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });
    
    if (!importRes.ok) {
      throw new Error(`Import failed: ${importRes.status} ${importRes.statusText} - ${await importRes.text()}`);
    }

    const result = await importRes.json();
    console.log('Import Result:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
