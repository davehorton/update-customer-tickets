#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function checkAllDatabases() {
  try {
    // Search for all databases
    const response = await notion.search({
      filter: {
        property: 'object',
        value: 'database'
      }
    });

    console.log(chalk.green('All accessible databases with "Support" or "Tickets":'));
    
    for (const db of response.results) {
      const name = db.title?.[0]?.plain_text || 'Untitled';
      if (name.toLowerCase().includes('support') || name.toLowerCase().includes('tickets')) {
        console.log(`\n📊 ${chalk.cyan.bold(name)}`);
        console.log(`${chalk.gray('ID:')} ${db.id}`);
        console.log(`${chalk.gray('Created:')} ${new Date(db.created_time).toLocaleString()}`);
        console.log(`${chalk.gray('URL:')} ${db.url}`);
        
        // Get properties
        try {
          const detailed = await notion.databases.retrieve({ database_id: db.id });
          console.log(`${chalk.yellow('Properties:')}`);
          Object.entries(detailed.properties).forEach(([propName, prop]) => {
            let extra = '';
            if (prop.type === 'title') extra = ' (TITLE FIELD)';
            if (prop.type === 'relation') extra = ` (→ ${prop.relation.database_id})`;
            console.log(`  • ${chalk.green(propName)}: ${prop.type}${extra}`);
          });
        } catch (e) {
          console.log(`  ${chalk.red('(Could not access properties)')}`);
        }
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

checkAllDatabases();