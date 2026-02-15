const https = require('https');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API_URL = 'https://tillywork.tangovision.dev/api/v1';
const EMAIL = 'pavel@tango.vision';
const PASSWORD = 'Hhhu35WL';
const CARD_ID = 598; // ID from the import result

async function main() {
  try {
    // 1. Login
    console.log('Logging in...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });

    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
    const { accessToken } = await loginRes.json();

    // 2. Fetch Card
    console.log(`Fetching Card ID ${CARD_ID}...`);
    const cardRes = await fetch(`${API_URL}/cards/${CARD_ID}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!cardRes.ok) {
        console.error(`Failed to fetch card: ${cardRes.status} ${await cardRes.text()}`);
    } else {
        const card = await cardRes.json();
        console.log('Card retrieved successfully!');
        console.log('Title:', card.slug || card.title || card.data?.title || 'Unknown');
        console.log('Data:', JSON.stringify(card.data, null, 2));
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
