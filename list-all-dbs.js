#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function listAllDatabases() {
  try {
    // Search for ALL databases
    const response = await notion.search({
      filter: { property: 'object', value: 'database' }
    });

    console.log(chalk.green(`Found ${response.results.length} accessible databases:`));
    
    response.results.forEach((db, i) => {
      const name = db.title?.[0]?.plain_text || 'Untitled';
      console.log(`${i+1}. ${chalk.cyan(name)}`);
      console.log(`   ID: ${chalk.gray(db.id)}`);
      console.log(`   Created: ${chalk.gray(new Date(db.created_time).toLocaleString())}`);
    });
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

listAllDatabases();