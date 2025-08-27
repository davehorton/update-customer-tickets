#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

// Check for required environment variables
if (!process.env.NOTION_TOKEN || !process.env.SUPPORT_TICKETS_DB) {
  console.log(chalk.red('Error: Missing required environment variables.'));
  console.log(chalk.yellow('Please ensure your .env file contains:'));
  console.log(chalk.cyan('  NOTION_TOKEN=your_notion_integration_token'));
  console.log(chalk.cyan('  SUPPORT_TICKETS_DB=your_support_tickets_database_id'));
  process.exit(1);
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function findDatabase() {
  try {
    // Get the Support Tickets database
    const db = await notion.databases.retrieve({
      database_id: process.env.SUPPORT_TICKETS_DB
    });

    console.log(chalk.green.bold('Support Tickets Database Location:'));
    console.log(chalk.cyan('Database URL:'), db.url);
    console.log(chalk.cyan('Database ID:'), db.id);
    console.log(chalk.cyan('Parent Type:'), db.parent.type);
    console.log(chalk.cyan('Parent Page ID:'), db.parent.page_id);

    // Get the parent page details
    if (db.parent.page_id) {
      try {
        const parentPage = await notion.pages.retrieve({
          page_id: db.parent.page_id
        });
        
        console.log(chalk.green.bold('\nParent Page Details:'));
        console.log(chalk.cyan('Parent URL:'), parentPage.url);
        
        // Try to get the parent page title
        const titleProp = Object.values(parentPage.properties).find(p => p.type === 'title');
        if (titleProp && titleProp.title.length > 0) {
          console.log(chalk.cyan('Parent Title:'), titleProp.title[0].plain_text);
        } else {
          console.log(chalk.yellow('Parent page has no title'));
        }
        
        console.log(chalk.yellow.bold('\n📍 To find this database in Notion:'));
        console.log('1. Open this URL in your browser:', chalk.blue.underline(db.url));
        console.log('2. Or go to the parent page:', chalk.blue.underline(parentPage.url));
        console.log('3. The database should be visible as a child of that page');
        
      } catch (e) {
        console.log(chalk.red('Could not retrieve parent page details'));
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

findDatabase();