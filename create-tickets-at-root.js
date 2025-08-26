#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';

// Load environment variables
dotenv.config();

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

async function createSupportTicketsDatabaseAtRoot() {
  const spinner = ora('Creating Support Tickets database at teamspace root...').start();
  
  try {
    // Create the Support Tickets database at teamspace root level
    const database = await notion.databases.create({
      parent: {
        type: 'workspace'
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
            database_id: '257f2e46-adcf-8003-8cf3-cf5d3acf2285', // Support Engagements database ID
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
    
    spinner.succeed('Support Tickets database created at teamspace root!');
    
    console.log(chalk.green.bold('\n✅ Database Details:'));
    console.log(chalk.cyan('Name:'), 'Support Tickets');
    console.log(chalk.cyan('ID:'), database.id);
    console.log(chalk.cyan('URL:'), database.url);
    console.log(chalk.cyan('Location:'), 'Teamspace root (should appear in left sidebar)');
    
    console.log(chalk.green.bold('\n📋 Properties:'));
    console.log('  • Ticket ID (title) - with clickable links to FreshDesk');
    console.log('  • Customer (relation to Support Engagements)');
    console.log('  • Status (Open, Pending, Waiting on Customer, Resolved, Closed)');
    console.log('  • Priority (Low, Medium, High, Urgent)');
    console.log('  • Created Date');
    console.log('  • FreshDesk ID');
    console.log('  • Issue Summary (includes agent name)');
    
    console.log(chalk.yellow('\n💡 Update sync-freshdesk.js:'));
    console.log(chalk.blue(`const SUPPORT_TICKETS_DB = '${database.id}';`));
    
    return database;
    
  } catch (error) {
    spinner.fail('Failed to create database');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

// Run the function
createSupportTicketsDatabaseAtRoot();