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

async function findParent() {
  try {
    // Get Support Engagements database details
    const db = await notion.databases.retrieve({
      database_id: process.env.SUPPORT_ENGAGEMENTS_DB
    });

    console.log(chalk.green('Support Engagements Database Location:'));
    console.log(chalk.cyan('Parent Type:'), db.parent.type);
    
    if (db.parent.type === 'workspace') {
      console.log(chalk.cyan('Location:'), 'Teamspace root');
      console.log(chalk.yellow('\nTo create Support Tickets at the same level, use:'));
      console.log(chalk.blue('parent: { type: "workspace" }'));
    } else if (db.parent.page_id) {
      console.log(chalk.cyan('Parent Page ID:'), db.parent.page_id);
      
      try {
        const parentPage = await notion.pages.retrieve({
          page_id: db.parent.page_id
        });
        
        console.log(chalk.cyan('Parent Page URL:'), parentPage.url);
        
        // Try to get the parent page title
        const titleProp = Object.values(parentPage.properties).find(p => p.type === 'title');
        if (titleProp && titleProp.title.length > 0) {
          console.log(chalk.cyan('Parent Title:'), titleProp.title[0].plain_text);
        }
        
        console.log(chalk.yellow('\nTo create Support Tickets at the same level, use:'));
        console.log(chalk.blue(`parent: { type: "page_id", page_id: "${db.parent.page_id}" }`));
        
      } catch (e) {
        console.log(chalk.red('Could not retrieve parent page details'));
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

findParent();