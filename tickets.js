#!/usr/bin/env node

import { Client } from '@notionhq/client';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';
import Table from 'cli-table3';

// Load environment variables
dotenv.config();

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// Check for required environment variables
if (!process.env.NOTION_TOKEN || !process.env.SUPPORT_TICKETS_DB || !process.env.SUPPORT_ENGAGEMENTS_DB) {
  console.log(chalk.red('Error: Missing required environment variables.'));
  console.log(chalk.yellow('Please ensure your .env file contains:'));
  console.log(chalk.cyan('  NOTION_TOKEN=your_notion_integration_token'));
  console.log(chalk.cyan('  SUPPORT_TICKETS_DB=your_support_tickets_database_id'));
  console.log(chalk.cyan('  SUPPORT_ENGAGEMENTS_DB=your_support_engagements_database_id'));
  process.exit(1);
}

const TICKETS_DB_ID = process.env.SUPPORT_TICKETS_DB;
const ENGAGEMENTS_DB_ID = process.env.SUPPORT_ENGAGEMENTS_DB;

// Helper function to find customer by name
async function findCustomerByName(name) {
  const response = await notion.databases.query({
    database_id: ENGAGEMENTS_DB_ID,
    filter: {
      property: 'Company',
      title: {
        contains: name
      }
    }
  });
  
  return response.results;
}

// Helper function to format property value
function formatPropertyValue(property) {
  if (!property) return '';
  
  switch (property.type) {
    case 'title':
      return property.title.map(t => t.plain_text).join('');
    case 'rich_text':
      return property.rich_text.map(t => t.plain_text).join('');
    case 'number':
      return property.number?.toString() || '';
    case 'select':
      return property.select?.name || '';
    case 'multi_select':
      return property.multi_select.map(s => s.name).join(', ');
    case 'date':
      if (property.date?.start) {
        return property.date.start;
      }
      return '';
    case 'people':
      return property.people.map(p => p.name || p.id).join(', ');
    case 'relation':
      return property.relation.length > 0 ? '✓' : '';
    case 'last_edited_time':
      return new Date(property.last_edited_time).toLocaleDateString();
    default:
      return '';
  }
}

// List tickets for a customer
async function listTicketsForCustomer(customerName, options) {
  const spinner = ora('Searching for customer...').start();
  
  try {
    // Find the customer
    const customers = await findCustomerByName(customerName);
    
    if (customers.length === 0) {
      spinner.fail(`No customer found with name containing "${customerName}"`);
      return;
    }
    
    if (customers.length > 1) {
      spinner.warn(`Found ${customers.length} customers matching "${customerName}"`);
      customers.forEach(c => {
        console.log(`  • ${formatPropertyValue(c.properties.Company)}`);
      });
      console.log(chalk.cyan('Using the first one.'));
    }
    
    const customer = customers[0];
    const customerTitle = formatPropertyValue(customer.properties.Company);
    
    spinner.text = 'Fetching tickets...';
    
    // Query tickets for this customer
    const ticketsResponse = await notion.databases.query({
      database_id: TICKETS_DB_ID,
      filter: {
        property: 'Customer',
        relation: {
          contains: customer.id
        }
      },
      sorts: [
        {
          property: 'Created Date',
          direction: 'descending'
        }
      ]
    });
    
    spinner.succeed(`Found ${ticketsResponse.results.length} tickets for ${customerTitle}`);
    
    if (ticketsResponse.results.length === 0) {
      console.log(chalk.yellow('No tickets found for this customer.'));
      return;
    }
    
    // Create table
    const table = new Table({
      head: ['Ticket ID', 'Status', 'Priority', 'Assignee', 'Created', 'Summary'],
      wordWrap: true,
      colWidths: [15, 15, 10, 15, 12, 35]
    });
    
    // Add tickets to table
    ticketsResponse.results.forEach(ticket => {
      table.push([
        formatPropertyValue(ticket.properties['Ticket ID']).substring(0, 30),
        chalk[getStatusColor(formatPropertyValue(ticket.properties['Status']))](
          formatPropertyValue(ticket.properties['Status'])
        ),
        chalk[getPriorityColor(formatPropertyValue(ticket.properties['Priority']))](
          formatPropertyValue(ticket.properties['Priority'])
        ),
        formatPropertyValue(ticket.properties['Assignee']).substring(0, 20),
        formatPropertyValue(ticket.properties['Created Date']),
        formatPropertyValue(ticket.properties['Issue Summary']).substring(0, 50)
      ]);
    });
    
    console.log(table.toString());
    
  } catch (error) {
    spinner.fail('Failed to fetch tickets');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

// Add a new ticket
async function addTicket(customerName, summary, options) {
  const spinner = ora('Creating ticket...').start();
  
  try {
    // Find the customer
    const customers = await findCustomerByName(customerName);
    
    if (customers.length === 0) {
      spinner.fail(`No customer found with name containing "${customerName}"`);
      return;
    }
    
    const customer = customers[0];
    const customerTitle = formatPropertyValue(customer.properties.Company);
    
    // Create the ticket
    const ticketData = {
      parent: { database_id: TICKETS_DB_ID },
      properties: {
        'Ticket ID': {
          title: [
            {
              text: {
                content: options.ticketId || `TICKET-${Date.now()}`
              }
            }
          ]
        },
        'Customer': {
          relation: [{ id: customer.id }]
        },
        'Issue Summary': {
          rich_text: [
            {
              text: {
                content: summary
              }
            }
          ]
        },
        'Status': {
          select: {
            name: options.status || 'Open'
          }
        },
        'Priority': {
          select: {
            name: options.priority || 'Medium'
          }
        },
        'Created Date': {
          date: {
            start: new Date().toISOString().split('T')[0]
          }
        }
      }
    };
    
    // Add optional fields
    if (options.freshdesk) {
      ticketData.properties['FreshDesk ID'] = {
        rich_text: [{ text: { content: options.freshdesk } }]
      };
    }
    
    if (options.assignee) {
      // Note: This would need the user's Notion user ID
      console.log(chalk.yellow('Note: Assignee field requires Notion user ID'));
    }
    
    if (options.tags) {
      ticketData.properties['Tags'] = {
        multi_select: options.tags.split(',').map(tag => ({ name: tag.trim() }))
      };
    }
    
    const response = await notion.pages.create(ticketData);
    
    spinner.succeed('Ticket created successfully!');
    console.log(chalk.green('✓ Ticket Details:'));
    console.log(chalk.cyan('  Customer:'), customerTitle);
    console.log(chalk.cyan('  Ticket ID:'), options.ticketId || `TICKET-${Date.now()}`);
    console.log(chalk.cyan('  Summary:'), summary);
    console.log(chalk.cyan('  Status:'), options.status || 'Open');
    console.log(chalk.cyan('  Priority:'), options.priority || 'Medium');
    
  } catch (error) {
    spinner.fail('Failed to create ticket');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

// List all tickets
async function listAllTickets(options) {
  const spinner = ora('Fetching all tickets...').start();
  
  try {
    const filter = {};
    
    // Add status filter if provided
    if (options.status) {
      filter.property = 'Status';
      filter.select = { equals: options.status };
    }
    
    const response = await notion.databases.query({
      database_id: TICKETS_DB_ID,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      sorts: [
        {
          property: 'Created Date',
          direction: 'descending'
        }
      ],
      page_size: options.limit || 20
    });
    
    spinner.succeed(`Found ${response.results.length} tickets`);
    
    if (response.results.length === 0) {
      console.log(chalk.yellow('No tickets found.'));
      return;
    }
    
    // Create table
    const table = new Table({
      head: ['Ticket ID', 'Customer', 'Status', 'Priority', 'Assignee', 'Created'],
      wordWrap: true,
      colWidths: [20, 20, 15, 10, 15, 12]
    });
    
    // Fetch customer names for relations
    for (const ticket of response.results) {
      const customerRelation = ticket.properties['Customer'].relation;
      let customerName = '';
      
      if (customerRelation && customerRelation.length > 0) {
        try {
          const customerPage = await notion.pages.retrieve({ page_id: customerRelation[0].id });
          customerName = formatPropertyValue(customerPage.properties.Company);
        } catch (e) {
          customerName = 'Unknown';
        }
      }
      
      table.push([
        formatPropertyValue(ticket.properties['Ticket ID']).substring(0, 30),
        customerName.substring(0, 25),
        chalk[getStatusColor(formatPropertyValue(ticket.properties['Status']))](
          formatPropertyValue(ticket.properties['Status'])
        ),
        chalk[getPriorityColor(formatPropertyValue(ticket.properties['Priority']))](
          formatPropertyValue(ticket.properties['Priority'])
        ),
        formatPropertyValue(ticket.properties['Assignee']).substring(0, 20),
        formatPropertyValue(ticket.properties['Created Date'])
      ]);
    }
    
    console.log(table.toString());
    
  } catch (error) {
    spinner.fail('Failed to fetch tickets');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

// Helper function for status colors
function getStatusColor(status) {
  switch(status) {
    case 'Open': return 'red';
    case 'In Progress': return 'yellow';
    case 'Resolved': return 'green';
    case 'Closed': return 'gray';
    default: return 'white';
  }
}

// Helper function for priority colors
function getPriorityColor(priority) {
  switch(priority) {
    case 'Critical': return 'red';
    case 'High': return 'magenta';
    case 'Medium': return 'yellow';
    case 'Low': return 'cyan';
    default: return 'white';
  }
}

// CLI setup
const program = new Command();

program
  .name('tickets')
  .description('Manage support tickets in Notion')
  .version('1.0.0');

program
  .command('list')
  .description('List all tickets')
  .option('-s, --status <status>', 'filter by status (Open, In Progress, Resolved, Closed)')
  .option('-l, --limit <number>', 'limit number of tickets', parseInt, 20)
  .action(listAllTickets);

program
  .command('customer <name>')
  .description('List tickets for a specific customer')
  .action(listTicketsForCustomer);

program
  .command('add <customer> <summary>')
  .description('Add a new ticket for a customer')
  .option('-t, --ticket-id <id>', 'ticket ID (default: auto-generated)')
  .option('-s, --status <status>', 'ticket status', 'Open')
  .option('-p, --priority <priority>', 'ticket priority', 'Medium')
  .option('-f, --freshdesk <id>', 'FreshDesk ticket ID')
  .option('--tags <tags>', 'comma-separated tags')
  .option('-a, --assignee <person>', 'assignee (requires Notion user ID)')
  .action(addTicket);

// Check for environment variable
if (!process.env.NOTION_TOKEN) {
  console.log(chalk.red('Error: NOTION_TOKEN not found in environment variables.'));
  process.exit(1);
}

program.parse();