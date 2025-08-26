#!/usr/bin/env node

import fetch from 'node-fetch';
import chalk from 'chalk';

const FRESHDESK_API_KEY = 'e43006zmskEJubAezbr9';
const FRESHDESK_DOMAIN = 'jambonz.freshdesk.com';

async function debugAgents() {
  try {
    console.log(chalk.green('Testing agent name fetching...'));
    
    // Get some tickets first
    const ticketsResponse = await fetch(`https://${FRESHDESK_DOMAIN}/api/v2/tickets?company_id=153000304883&per_page=5`, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(FRESHDESK_API_KEY + ':X').toString('base64')
      }
    });
    
    if (!ticketsResponse.ok) {
      throw new Error(`Tickets API error: ${ticketsResponse.status}`);
    }
    
    const tickets = await ticketsResponse.json();
    
    console.log(chalk.cyan(`Found ${tickets.length} tickets to test:`));
    
    // Test fetching agent names for each ticket
    for (const ticket of tickets.slice(0, 3)) {
      console.log(`\n${chalk.yellow('Ticket:')} ${ticket.subject}`);
      console.log(`${chalk.yellow('Responder ID:')} ${ticket.responder_id || 'None'}`);
      
      if (ticket.responder_id) {
        try {
          const agentResponse = await fetch(`https://${FRESHDESK_DOMAIN}/api/v2/agents/${ticket.responder_id}`, {
            headers: {
              'Authorization': 'Basic ' + Buffer.from(FRESHDESK_API_KEY + ':X').toString('base64')
            }
          });
          
          if (agentResponse.ok) {
            const agent = await agentResponse.json();
            console.log(`${chalk.green('✓ Agent Name:')} ${agent.contact?.name}`);
            console.log(`${chalk.green('  Email:')} ${agent.contact?.email}`);
          } else {
            console.log(`${chalk.red('✗ Agent fetch failed:')} ${agentResponse.status} ${agentResponse.statusText}`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.log(`${chalk.red('✗ Error fetching agent:')} ${error.message}`);
        }
      } else {
        console.log(`${chalk.gray('No responder assigned')}`);
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

debugAgents();