#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

// Check for required environment variables
if (!process.env.NOTION_TOKEN || !process.env.SUPPORT_ENGAGEMENTS_DB) {
  console.log('Error: Missing required environment variables.');
  console.log('Please ensure your .env file contains:');
  console.log('  NOTION_TOKEN=your_notion_integration_token');
  console.log('  SUPPORT_ENGAGEMENTS_DB=your_support_engagements_database_id');
  process.exit(1);
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function debugDatabase() {
  try {
    // Query the Support Engagements database
    const response = await notion.databases.query({
      database_id: process.env.SUPPORT_ENGAGEMENTS_DB,
      page_size: 5
    });

    console.log('Support Engagements Database Analysis:\n');
    console.log('Total entries found:', response.results.length);
    console.log('\nFirst 5 entries details:\n');
    
    for (let i = 0; i < response.results.length; i++) {
      const page = response.results[i];
      console.log(`Entry ${i+1}:`);
      console.log('  Page ID:', page.id);
      console.log('  Created:', new Date(page.created_time).toLocaleString());
      console.log('  Properties:');
      
      // Check each property
      Object.entries(page.properties).forEach(([propName, propValue]) => {
        let value = '';
        
        if (propValue.type === 'title') {
          value = propValue.title.map(t => t.plain_text).join('');
          console.log(`    ${propName} (${propValue.type}): "${value}" [${propValue.title.length} text blocks]`);
        } else if (propValue.type === 'rich_text') {
          value = propValue.rich_text.map(t => t.plain_text).join('');
          if (value) console.log(`    ${propName} (${propValue.type}): "${value}"`);
        } else if (propValue.type === 'select') {
          value = propValue.select?.name || '';
          if (value) console.log(`    ${propName} (${propValue.type}): "${value}"`);
        } else if (propValue.type === 'people') {
          value = propValue.people.map(p => p.name || p.id).join(', ');
          if (value) console.log(`    ${propName} (${propValue.type}): "${value}"`);
        }
      });
      
      // Try to get the page title from the page itself
      console.log('  Page object type:', page.object);
      
      // Check if page has child content
      if (page.has_children) {
        console.log('  Has child content: Yes');
      }
      
      console.log('');
    }
    
    // Also check the database structure
    console.log('\n=== Database Structure ===\n');
    const db = await notion.databases.retrieve({
      database_id: process.env.SUPPORT_ENGAGEMENTS_DB
    });
    
    console.log('Database Title:', db.title?.[0]?.plain_text || 'No title');
    console.log('\nProperties Configuration:');
    Object.entries(db.properties).forEach(([name, config]) => {
      console.log(`  ${name}:`);
      console.log(`    Type: ${config.type}`);
      if (config.type === 'title') {
        console.log('    ** This is the title property **');
      }
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugDatabase();