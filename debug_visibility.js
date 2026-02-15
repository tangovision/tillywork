const https = require('https');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API_URL = 'https://tillywork.tangovision.dev/api/v1';
const EMAIL = 'pavel@tango.vision';
const PASSWORD = 'Hhhu35WL';
// From latest run: "8692tucue": 796
const CARD_ID = 796; 
const LIST_ID = 12; // From latest run

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

    // 2. Fetch Card details to see raw data
    console.log(`Fetching Card ID ${CARD_ID}...`);
    const cardRes = await fetch(`${API_URL}/cards/${CARD_ID}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    if (cardRes.ok) {
        const card = await cardRes.json();
        console.log('Card found:', card.title || card.slug);
        // Does the API return cardLists?
        if (card.cardLists) {
            console.log('CardLists included in card response:', JSON.stringify(card.cardLists, null, 2));
        } else {
            console.log('CardLists NOT in card response.');
        }
    } else {
        console.error('Failed to fetch card');
    }

    // 3. Fetch List details to see stages
    console.log(`Fetching List ID ${LIST_ID} details...`);
    const listRes = await fetch(`${API_URL}/lists/${LIST_ID}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (listRes.ok) {
        const list = await listRes.json();
        console.log(`List: ${list.name}`);
        console.log('Stages:', list.listStages.map(s => `ID: ${s.id}, Name: "${s.name}"`).join(' | '));
        
        // 4. Try to fetch cards in this list via the cards endpoint to see if they appear in query
        console.log('Searching for cards in this list...');
        // The frontend likely uses /cards or /lists/:id/cards
        const cardsInListRes = await fetch(`${API_URL}/cards?listId=${LIST_ID}&limit=5`, {
             method: 'GET',
             headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        
        if (cardsInListRes.ok) {
            const result = await cardsInListRes.json();
            console.log(`API returned ${result.total || result.length || 0} cards for List ${LIST_ID}`);
            if (Array.isArray(result.items)) {
                console.log('Sample items:', result.items.map(i => `${i.id}: ${i.title}`));
            } else if (Array.isArray(result)) {
                console.log('Sample items:', result.map(i => `${i.id}: ${i.title}`));
            }
        } else {
            console.error(`Failed to search cards: ${cardsInListRes.status} ${await cardsInListRes.text()}`);
        }

    } else {
        console.error('Failed to fetch list');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
