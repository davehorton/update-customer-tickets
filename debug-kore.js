#!/usr/bin/env node

import { Client } from '@notionhq/client';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

async function debugKore() {
  try {
    console.log(chalk.green('Finding and analyzing Kore page...'));
    
    // Find Kore page
    const response = await notion.search({
      query: 'Kore',
      filter: {
        property: 'object',
        value: 'page'
      },
    });
    
    const korePage = response.results[0];
    console.log(chalk.cyan(`\nKore Page ID: ${korePage.id}`));
    console.log(chalk.cyan(`URL: ${korePage.url}`));
    
    // Get all blocks from the Kore page
    console.log(chalk.yellow('\nGetting blocks from Kore page...'));
    
    const blocks = [];
    let cursor = undefined;
    
    do {
      const blockResponse = await notion.blocks.children.list({
        block_id: korePage.id,
        start_cursor: cursor,
      });
      
      blocks.push(...blockResponse.results);
      cursor = blockResponse.has_more ? blockResponse.next_cursor : undefined;
    } while (cursor);
    
    console.log(chalk.cyan(`\nFound ${blocks.length} blocks:\n`));
    
    blocks.forEach((block, index) => {
      console.log(`${index + 1}. ${chalk.bold(block.type)}`);
      console.log(`   ID: ${chalk.dim(block.id)}`);
      
      if (block.type === 'child_database') {
        console.log(`   ${chalk.green('*** INLINE DATABASE FOUND ***')}`);
      }
      
      // Show some content for context
      if (block[block.type]?.rich_text) {
        const text = block[block.type].rich_text.map(t => t.plain_text).join('');
        console.log(`   Content: ${chalk.dim(text.substring(0, 100))}`);
      }
      
      console.log('---');
    });
    
    // Try to access each child_database
    const childDatabases = blocks.filter(block => block.type === 'child_database');
    
    if (childDatabases.length === 0) {
      console.log(chalk.red('\nNo child_database blocks found in Kore page!'));
    } else {
      console.log(chalk.green(`\nFound ${childDatabases.length} child database(s). Testing access...`));
      
      for (const db of childDatabases) {
        try {
          console.log(chalk.yellow(`\nTesting database access: ${db.id}`));
          const database = await notion.databases.retrieve({ database_id: db.id });
          console.log(chalk.green(`✓ Success! Database title: ${database.title?.[0]?.plain_text || 'Untitled'}`));
          console.log(`  Properties: ${Object.keys(database.properties).join(', ')}`);
        } catch (error) {
          console.log(chalk.red(`✗ Failed: ${error.message}`));
        }
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

debugKore();