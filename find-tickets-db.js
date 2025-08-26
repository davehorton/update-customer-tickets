#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function findTicketsDatabase() {
  try {
    console.log(chalk.green('Searching for Support Tickets database...'));
    
    const response = await notion.search({
      query: 'Support Tickets',
      filter: {
        property: 'object',
        value: 'database'
      }
    });
    
    if (response.results.length === 0) {
      console.log(chalk.red('No Support Tickets database found'));
      console.log(chalk.yellow('Make sure the database is shared with your integration'));
      return;
    }
    
    console.log(chalk.green(`Found ${response.results.length} database(s):`));
    
    for (const db of response.results) {
      console.log(`\n${chalk.cyan('Name:')} ${db.title?.[0]?.plain_text || 'Untitled'}`);
      console.log(`${chalk.cyan('ID:')} ${db.id}`);
      console.log(`${chalk.cyan('URL:')} ${db.url}`);
      
      // Get detailed database info
      try {
        const detailed = await notion.databases.retrieve({ database_id: db.id });
        
        console.log(`${chalk.cyan('Properties:')}`);
        Object.entries(detailed.properties).forEach(([name, prop]) => {
          console.log(`  • ${chalk.yellow(name)}: ${prop.type}`);
          
          // Show select options if it's a select field
          if (prop.type === 'select' && prop.select.options) {
            const options = prop.select.options.map(opt => opt.name).join(', ');
            console.log(`    Options: ${options}`);
          }
          
          // Show relation info if it's a relation field
          if (prop.type === 'relation') {
            console.log(`    Related to: ${prop.relation.database_id}`);
          }
        });
        
      } catch (error) {
        console.log(chalk.red(`    Could not retrieve detailed info: ${error.message}`));
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

findTicketsDatabase();