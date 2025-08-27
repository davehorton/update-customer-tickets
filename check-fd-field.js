#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

// Check for required environment variables
if (!process.env.NOTION_TOKEN || !process.env.SUPPORT_ENGAGEMENTS_DB) {
  console.log(chalk.red('Error: Missing required environment variables.'));
  console.log(chalk.yellow('Please ensure your .env file contains:'));
  console.log(chalk.cyan('  NOTION_TOKEN=your_notion_integration_token'));
  console.log(chalk.cyan('  SUPPORT_ENGAGEMENTS_DB=your_support_engagements_database_id'));
  process.exit(1);
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function checkFreshDeskField() {
  try {
    // First check the database structure
    console.log(chalk.green.bold('Checking Support Engagements database structure...'));
    
    const db = await notion.databases.retrieve({
      database_id: process.env.SUPPORT_ENGAGEMENTS_DB
    });
    
    // Look for FreshDesk field
    const fdField = Object.entries(db.properties).find(([name, prop]) => 
      name.toLowerCase().includes('freshdesk') || name.toLowerCase().includes('fd')
    );
    
    if (fdField) {
      console.log(chalk.green(`✓ Found FreshDesk field: "${fdField[0]}" (type: ${fdField[1].type})`));
    } else {
      console.log(chalk.red('✗ No FreshDesk field found'));
      console.log(chalk.yellow('\nAvailable fields:'));
      Object.keys(db.properties).forEach(name => console.log(`  - ${name}`));
      return;
    }
    
    // Now check for Kore company
    console.log(chalk.green.bold('\nSearching for Kore company...'));
    
    const response = await notion.databases.query({
      database_id: process.env.SUPPORT_ENGAGEMENTS_DB,
      filter: {
        property: 'Company',
        title: {
          contains: 'Kore'
        }
      }
    });
    
    if (response.results.length === 0) {
      console.log(chalk.red('✗ Kore company not found'));
      return;
    }
    
    const kore = response.results[0];
    console.log(chalk.green(`✓ Found Kore (ID: ${kore.id})`));
    
    // Check all properties of Kore
    console.log(chalk.cyan('\nKore properties:'));
    Object.entries(kore.properties).forEach(([name, prop]) => {
      let value = '';
      if (prop.type === 'title') {
        value = prop.title.map(t => t.plain_text).join('');
      } else if (prop.type === 'rich_text') {
        value = prop.rich_text.map(t => t.plain_text).join('');
      } else if (prop.type === 'number') {
        value = prop.number?.toString() || '';
      }
      
      if (value) {
        console.log(`  ${name}: ${value}`);
      }
    });
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

checkFreshDeskField();