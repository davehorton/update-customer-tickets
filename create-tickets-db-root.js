#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';

// Load environment variables
dotenv.config();

// Check for required environment variables
if (!process.env.NOTION_TOKEN || !process.env.SUPPORT_ENGAGEMENTS_DB) {
  console.log(chalk.red('Error: Missing required environment variables.'));
  console.log(chalk.yellow('Please ensure your .env file contains:'));
  console.log(chalk.cyan('  NOTION_TOKEN=your_notion_integration_token'));
  console.log(chalk.cyan('  SUPPORT_ENGAGEMENTS_DB=your_support_engagements_database_id'));
  process.exit(1);
}

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

async function createSupportTicketsDatabaseAtRoot() {
  const spinner = ora('Creating Support Tickets database at teamspace root...').start();
  
  try {
    // Search for pages that might be teamspace root or main workspace pages
    const searchResponse = await notion.search({
      filter: {
        property: 'object',
        value: 'page'
      }
    });
    
    spinner.text = 'Finding suitable parent location...';
    
    // Look for a page that seems like a good root location
    // Try to find pages with simple titles or that seem like main workspace pages
    let parentPageId = null;
    
    // Let's try to find the teamspace by looking for pages with workspace-like names
    for (const page of searchResponse.results) {
      // Check if page has a simple title that might indicate it's a main workspace
      if (page.properties && page.properties.title && page.properties.title.title) {
        const title = page.properties.title.title[0]?.plain_text || '';
        
        // Look for pages with teamspace-like names or simple titles
        if (title.toLowerCase().includes('jambonz') || 
            title.toLowerCase().includes('team') ||
            title.toLowerCase().includes('workspace') ||
            title === '' || 
            title.length < 20) {
          parentPageId = page.id;
          console.log(chalk.cyan(`\nUsing parent page: "${title}" (${page.id})`));
          break;
        }
      }
    }
    
    // If we couldn't find a good parent, use the Support Engagements database's parent
    if (!parentPageId) {
      const engagementsDb = await notion.databases.retrieve({
        database_id: process.env.SUPPORT_ENGAGEMENTS_DB
      });
      
      if (engagementsDb.parent.type === 'page_id') {
        parentPageId = engagementsDb.parent.page_id;
        console.log(chalk.cyan(`\nUsing same parent as Support Engagements database`));
      }
    }
    
    if (!parentPageId) {
      spinner.fail('Could not find suitable parent page');
      console.log(chalk.red('Please manually specify a parent page ID'));
      return;
    }
    
    // Create the Support Tickets database
    const database = await notion.databases.create({
      parent: {
        type: 'page_id',
        page_id: parentPageId
      },
      icon: {
        type: 'emoji',
        emoji: '🎫'
      },
      title: [
        {
          type: 'text',
          text: {
            content: 'Support Tickets'
          }
        }
      ],
      properties: {
        'Ticket ID': {
          title: {}  // This is the title property (required)
        },
        'Customer': {
          relation: {
            database_id: process.env.SUPPORT_ENGAGEMENTS_DB, // Support Engagements database ID
            single_property: {}  // Single relation (one customer per ticket)
          }
        },
        'Status': {
          select: {
            options: [
              { name: 'Open', color: 'red' },
              { name: 'Pending', color: 'yellow' },
              { name: 'Waiting on Customer', color: 'orange' },
              { name: 'Resolved', color: 'green' },
              { name: 'Closed', color: 'gray' }
            ]
          }
        },
        'Priority': {
          select: {
            options: [
              { name: 'Low', color: 'blue' },
              { name: 'Medium', color: 'yellow' },
              { name: 'High', color: 'orange' },
              { name: 'Urgent', color: 'red' }
            ]
          }
        },
        'Created Date': {
          date: {}
        },
        'FreshDesk ID': {
          rich_text: {}
        },
        'Issue Summary': {
          rich_text: {}
        }
      }
    });
    
    spinner.succeed('Support Tickets database created successfully!');
    
    console.log(chalk.green.bold('\n✅ Database Details:'));
    console.log(chalk.cyan('Name:'), 'Support Tickets');
    console.log(chalk.cyan('ID:'), database.id);
    console.log(chalk.cyan('URL:'), database.url);
    console.log(chalk.cyan('Parent Page:'), parentPageId);
    
    console.log(chalk.green.bold('\n📋 Simplified Properties:'));
    console.log('  • Ticket ID (title) - with clickable links to FreshDesk');
    console.log('  • Customer (relation to Support Engagements)');
    console.log('  • Status (Open, Pending, Waiting on Customer, Resolved, Closed)');
    console.log('  • Priority (Low, Medium, High, Urgent)');
    console.log('  • Created Date');
    console.log('  • FreshDesk ID');
    console.log('  • Issue Summary (includes agent name)');
    
    console.log(chalk.yellow('\n💡 Next steps:'));
    console.log('1. Check if the database appears in your left sidebar');
    console.log('2. If not, you may need to move it manually to your teamspace root');
    console.log('3. Update the SUPPORT_TICKETS_DB constant in sync-freshdesk.js to:');
    console.log(chalk.blue(`   const SUPPORT_TICKETS_DB = '${database.id}';`));
    
    return database;
    
  } catch (error) {
    spinner.fail('Failed to create database');
    console.error(chalk.red('Error:'), error.message);
    if (error.code === 'unauthorized') {
      console.log(chalk.yellow('\nMake sure your NOTION_TOKEN has permission to create databases'));
    }
    process.exit(1);
  }
}

// Run the function
createSupportTicketsDatabaseAtRoot();