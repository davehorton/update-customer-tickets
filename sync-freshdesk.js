#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';
import fetch from 'node-fetch';

dotenv.config();

// Configuration
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY;
const FRESHDESK_DOMAIN = process.env.FRESHDESK_DOMAIN;
const SUPPORT_ENGAGEMENTS_DB = process.env.SUPPORT_ENGAGEMENTS_DB;
const SUPPORT_TICKETS_DB = process.env.SUPPORT_TICKETS_DB;

// Initialize Notion client
const notion = new Client({ auth: NOTION_TOKEN });

// FreshDesk status mapping
const STATUS_MAP = {
  2: 'Open',
  3: 'Pending',
  4: 'Resolved',
  5: 'Closed',
  6: 'Waiting on Customer'
};

// FreshDesk priority mapping
const PRIORITY_MAP = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Urgent'
};

// Cache for agent names
const agentCache = {};

// Fetch agent name from FreshDesk
async function getAgentName(agentId) {
  if (!agentId) return '';
  
  if (agentCache[agentId]) {
    return agentCache[agentId];
  }
  
  try {
    const response = await fetch(`https://${FRESHDESK_DOMAIN}/api/v2/agents/${agentId}`, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(FRESHDESK_API_KEY + ':X').toString('base64')
      }
    });
    
    if (response.ok) {
      const agent = await response.json();
      agentCache[agentId] = agent.contact?.name || 'Unknown';
      return agentCache[agentId];
    }
  } catch (error) {
    console.log(chalk.yellow(`  Could not fetch agent name for ID ${agentId}`));
  }
  
  return 'Unknown';
}

// Fetch tickets from FreshDesk for a company
async function fetchFreshDeskTickets(companyId) {
  const url = `https://${FRESHDESK_DOMAIN}/api/v2/tickets?company_id=${companyId}&per_page=100`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': 'Basic ' + Buffer.from(FRESHDESK_API_KEY + ':X').toString('base64')
    }
  });
  
  if (!response.ok) {
    throw new Error(`FreshDesk API error: ${response.status} ${response.statusText}`);
  }
  
  const allTickets = await response.json();
  
  // Filter for only Open, Pending, and Waiting on Customer statuses
  return allTickets.filter(ticket => 
    ticket.status === 2 || ticket.status === 3 || ticket.status === 6
  );
}

// Delete existing tickets for a customer in Notion
async function deleteExistingTickets(customerId, customerName) {
  // Query for all tickets linked to this customer
  const response = await notion.databases.query({
    database_id: SUPPORT_TICKETS_DB,
    filter: {
      property: '💁 Support Engagements',
      relation: {
        contains: customerId
      }
    }
  });
  
  if (response.results.length > 0) {
    console.log(chalk.yellow(`  Deleting ${response.results.length} existing tickets for ${customerName}...`));
    
    // Delete each ticket
    for (const ticket of response.results) {
      await notion.pages.update({
        page_id: ticket.id,
        archived: true
      });
    }
  }
}

// Create a ticket in Notion
async function createNotionTicket(ticket, customerId, customerName, agentName) {
  const ticketUrl = `https://${FRESHDESK_DOMAIN}/support/tickets/${ticket.id}`;
  
  const pageData = {
    parent: { database_id: SUPPORT_TICKETS_DB },
    properties: {
      'Title': {
        title: [
          {
            text: {
              content: `FD-${ticket.id}: ${ticket.subject}`,
              link: {
                url: ticketUrl
              }
            }
          }
        ]
      },
      '💁 Support Engagements': {
        relation: [{ id: customerId }]
      },
      'Status': {
        select: {
          name: STATUS_MAP[ticket.status] || 'Open'
        }
      },
      'Created': {
        date: {
          start: ticket.created_at.split('T')[0]
        }
      },
      'Agent': {
        rich_text: [
          {
            text: {
              content: agentName || 'Unassigned'
            }
          }
        ]
      }
    }
  };
  
  await notion.pages.create(pageData);
}

// Update the customer page with sync timestamp
async function updateCustomerPageWithTimestamp(customerId, ticketCount) {
  try {
    // Get all existing blocks
    const blocks = [];
    let cursor = undefined;
    
    do {
      const response = await notion.blocks.children.list({
        block_id: customerId,
        start_cursor: cursor,
      });
      blocks.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);
    
    // Find and update or create the timestamp block
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
    
    const timestampText = `📅 Support Tickets (Last updated: ${timestamp} - ${ticketCount} active tickets)`;
    
    // Look for existing timestamp block (contains "Support Tickets (Last updated:")
    let timestampBlockId = null;
    let insertAfterBlockId = null;
    
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      
      // Check if this is our timestamp block
      if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
        const text = block.paragraph.rich_text[0].plain_text || '';
        if (text.includes('Support Tickets (Last updated:')) {
          timestampBlockId = block.id;
          break;
        }
      }
      
      // Look for "System Information" heading to know where to insert
      if (block.type === 'heading_1' && block.heading_1.rich_text.length > 0) {
        const text = block.heading_1.rich_text[0].plain_text || '';
        if (text.includes('System Information')) {
          // Find the last block of the System Information section
          // (usually ends before the next heading or the timestamp)
          for (let j = i + 1; j < blocks.length; j++) {
            if (blocks[j].type === 'heading_1' || blocks[j].type === 'heading_2' ||
                (blocks[j].type === 'paragraph' && blocks[j].paragraph.rich_text.length > 0 &&
                 blocks[j].paragraph.rich_text[0].plain_text?.includes('Support Tickets'))) {
              insertAfterBlockId = blocks[j - 1].id;
              break;
            }
          }
          if (!insertAfterBlockId && i < blocks.length - 1) {
            insertAfterBlockId = blocks[blocks.length - 1].id;
          }
        }
      }
    }
    
    if (timestampBlockId) {
      // Update existing timestamp block
      await notion.blocks.update({
        block_id: timestampBlockId,
        paragraph: {
          rich_text: [
            {
              text: {
                content: timestampText
              }
            }
          ]
        }
      });
    } else if (insertAfterBlockId) {
      // Create new timestamp block after System Information
      await notion.blocks.children.append({
        block_id: customerId,
        children: [
          {
            paragraph: {
              rich_text: [
                {
                  text: {
                    content: '\n'  // Add spacing
                  }
                }
              ]
            }
          },
          {
            paragraph: {
              rich_text: [
                {
                  text: {
                    content: timestampText
                  }
                }
              ]
            }
          }
        ],
        after: insertAfterBlockId
      });
    } else {
      // Just append at the end if we couldn't find System Information
      await notion.blocks.children.append({
        block_id: customerId,
        children: [
          {
            paragraph: {
              rich_text: [
                {
                  text: {
                    content: timestampText
                  }
                }
              ]
            }
          }
        ]
      });
    }
    
  } catch (error) {
    console.log(chalk.yellow(`  Could not update timestamp on customer page: ${error.message}`));
  }
}

// Main sync function
async function syncFreshDeskTickets() {
  const spinner = ora('Fetching customers from Notion...').start();
  
  try {
    // Get all customers with FreshDesk IDs
    const customersResponse = await notion.databases.query({
      database_id: SUPPORT_ENGAGEMENTS_DB,
      filter: {
        property: 'FD ID',
        rich_text: {
          is_not_empty: true
        }
      }
    });
    
    spinner.succeed(`Found ${customersResponse.results.length} customers with FreshDesk IDs`);
    
    let totalTicketsCreated = 0;
    
    // Process each customer
    for (const customer of customersResponse.results) {
      const customerName = customer.properties.Company.title[0]?.plain_text || 'Unknown';
      const freshDeskId = customer.properties['FD ID'].rich_text[0]?.plain_text;
      
      if (!freshDeskId) continue;
      
      console.log(chalk.cyan.bold(`\nProcessing ${customerName} (FD ID: ${freshDeskId})...`));
      
      try {
        // Fetch tickets from FreshDesk
        const spinner2 = ora('Fetching tickets from FreshDesk...').start();
        const tickets = await fetchFreshDeskTickets(freshDeskId);
        spinner2.succeed(`Found ${tickets.length} open/pending tickets`);
        
        // Delete existing tickets in Notion
        await deleteExistingTickets(customer.id, customerName);
        
        // Create new tickets
        let created = 0;
        
        if (tickets.length > 0) {
          const spinner3 = ora('Creating tickets in Notion...').start();
          
          for (const ticket of tickets) {
            // Get agent name
            const agentName = await getAgentName(ticket.responder_id);
            
            // Create ticket in Notion
            await createNotionTicket(ticket, customer.id, customerName, agentName);
            created++;
          }
          
          spinner3.succeed(`Created ${created} tickets for ${customerName}`);
        } else {
          console.log(chalk.gray('  No active tickets to sync'));
        }
        
        // Update the customer page with timestamp
        await updateCustomerPageWithTimestamp(customer.id, created);
        
        totalTicketsCreated += created;
        
      } catch (error) {
        console.log(chalk.red(`  Error processing ${customerName}: ${error.message}`));
      }
    }
    
    console.log(chalk.green.bold(`\n✅ Sync complete! Created ${totalTicketsCreated} total tickets.`));
    
    console.log(chalk.yellow('\n📍 Next steps:'));
    console.log('1. Go to each customer page in Notion');
    console.log('2. You\'ll see the "Support Tickets (Last updated: ...)" text');
    console.log('3. Add a linked database view of Support Tickets right below that text');
    console.log('4. Filter the view to show only tickets for that customer');
    console.log('5. The ticket titles are clickable links to FreshDesk!');
    
  } catch (error) {
    spinner.fail('Sync failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

// Check for required environment variables
if (!NOTION_TOKEN || !FRESHDESK_API_KEY || !FRESHDESK_DOMAIN || !SUPPORT_ENGAGEMENTS_DB || !SUPPORT_TICKETS_DB) {
  console.log(chalk.red('Error: Missing required environment variables.'));
  console.log(chalk.yellow('Please ensure your .env file contains:'));
  console.log(chalk.cyan('  NOTION_TOKEN=your_notion_integration_token'));
  console.log(chalk.cyan('  FRESHDESK_API_KEY=your_freshdesk_api_key'));
  console.log(chalk.cyan('  FRESHDESK_DOMAIN=your_domain.freshdesk.com'));
  console.log(chalk.cyan('  SUPPORT_ENGAGEMENTS_DB=your_support_engagements_database_id'));
  console.log(chalk.cyan('  SUPPORT_TICKETS_DB=your_support_tickets_database_id'));
  process.exit(1);
}

// Run the sync
syncFreshDeskTickets();