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

async function createSupportTicketsDatabase() {
  const spinner = ora('Creating Support Tickets database...').start();
  
  try {
    // First, get a page to create the database in (we'll use the first page we can find)
    // In production, you might want to specify a specific parent page ID
    const searchResponse = await notion.search({
      filter: {
        property: 'object',
        value: 'page'
      },
      page_size: 1
    });
    
    if (searchResponse.results.length === 0) {
      spinner.fail('No pages found to create database in');
      console.log(chalk.yellow('Please create a page first or specify a parent page ID'));
      return;
    }
    
    const parentPageId = searchResponse.results[0].id;
    console.log(chalk.cyan(`\nCreating database in page: ${searchResponse.results[0].id}`));
    
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
            database_id: '257f2e46-adcf-8003-8cf3-cf5d3acf2285', // Support Engagements database ID
            single_property: {}  // Single relation (one customer per ticket)
          }
        },
        'Status': {
          select: {
            options: [
              { name: 'Open', color: 'red' },
              { name: 'In Progress', color: 'yellow' },
              { name: 'Waiting on Customer', color: 'orange' },
              { name: 'Resolved', color: 'green' },
              { name: 'Closed', color: 'gray' }
            ]
          }
        },
        'Priority': {
          select: {
            options: [
              { name: 'Critical', color: 'red' },
              { name: 'High', color: 'orange' },
              { name: 'Medium', color: 'yellow' },
              { name: 'Low', color: 'blue' }
            ]
          }
        },
        'Assignee': {
          people: {}
        },
        'Created Date': {
          date: {}
        },
        'Last Updated': {
          last_edited_time: {}
        },
        'Due Date': {
          date: {}
        },
        'FreshDesk ID': {
          rich_text: {}
        },
        'Issue Summary': {
          rich_text: {}
        },
        'Resolution': {
          rich_text: {}
        },
        'Tags': {
          multi_select: {
            options: [
              { name: 'Bug', color: 'red' },
              { name: 'Feature Request', color: 'blue' },
              { name: 'Configuration', color: 'green' },
              { name: 'Performance', color: 'yellow' },
              { name: 'Integration', color: 'purple' },
              { name: 'Billing', color: 'pink' },
              { name: 'Documentation', color: 'gray' }
            ]
          }
        },
        'Time Spent (hours)': {
          number: {
            format: 'number'
          }
        },
        'SLA Status': {
          select: {
            options: [
              { name: 'Within SLA', color: 'green' },
              { name: 'At Risk', color: 'yellow' },
              { name: 'Breached', color: 'red' }
            ]
          }
        }
      }
    });
    
    spinner.succeed('Support Tickets database created successfully!');
    
    console.log(chalk.green.bold('\n✅ Database Details:'));
    console.log(chalk.cyan('Name:'), 'Support Tickets');
    console.log(chalk.cyan('ID:'), database.id);
    console.log(chalk.cyan('URL:'), database.url);
    console.log(chalk.cyan('Parent Page:'), parentPageId);
    
    console.log(chalk.green.bold('\n📋 Properties created:'));
    console.log('  • Ticket ID (title)');
    console.log('  • Customer (relation to Support Engagements)');
    console.log('  • Status (Open, In Progress, Waiting on Customer, Resolved, Closed)');
    console.log('  • Priority (Critical, High, Medium, Low)');
    console.log('  • Assignee');
    console.log('  • Created Date');
    console.log('  • Last Updated');
    console.log('  • Due Date');
    console.log('  • FreshDesk ID');
    console.log('  • Issue Summary');
    console.log('  • Resolution');
    console.log('  • Tags');
    console.log('  • Time Spent (hours)');
    console.log('  • SLA Status');
    
    console.log(chalk.yellow('\n💡 Next steps:'));
    console.log('1. Move the database to your desired location in Notion');
    console.log('2. Add linked database views to customer pages');
    console.log('3. Start creating tickets using add-ticket.js (coming next)');
    
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
createSupportTicketsDatabase();