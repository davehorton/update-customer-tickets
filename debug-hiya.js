#!/usr/bin/env node

import { Client } from '@notionhq/client';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

dotenv.config();

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// Debug: Find all pages containing "Hiya"
async function debugHiyaPages() {
  const spinner = ora('Searching for all Hiya-related pages...').start();
  
  try {
    const response = await notion.search({
      query: 'Hiya',
      filter: {
        property: 'object',
        value: 'page'
      },
    });
    
    spinner.succeed(`Found ${response.results.length} page(s) containing "Hiya"`);
    
    if (response.results.length === 0) {
      console.log(chalk.yellow('\nNo pages found containing "Hiya"'));
      return;
    }
    
    for (let i = 0; i < response.results.length; i++) {
      const page = response.results[i];
      console.log(chalk.cyan(`\n--- Page ${i + 1} ---`));
      console.log(chalk.white(`ID: ${page.id}`));
      
      // Get page title
      let title = 'Untitled';
      if (page.properties) {
        const titleProp = Object.values(page.properties).find(prop => prop.type === 'title');
        if (titleProp && titleProp.title && titleProp.title.length > 0) {
          title = titleProp.title[0].plain_text;
        }
      }
      console.log(chalk.white(`Title: ${title}`));
      
      // Check for child pages
      try {
        const children = await notion.blocks.children.list({
          block_id: page.id,
        });
        
        const childPages = children.results.filter(block => block.type === 'child_page');
        console.log(chalk.white(`Child pages: ${childPages.length}`));
        
        if (childPages.length > 0) {
          console.log(chalk.green(`✓ This page has child pages`));
          childPages.forEach((child, idx) => {
            const childTitle = child.child_page?.title || 'Untitled';
            console.log(chalk.gray(`  ${idx + 1}. ${childTitle}`));
          });
        } else {
          console.log(chalk.red(`✗ No child pages found`));
        }
        
        // Check for FD ID property
        if (page.properties) {
          const fdIdProp = Object.keys(page.properties).find(key => 
            key.toLowerCase().includes('fd') && key.toLowerCase().includes('id')
          );
          if (fdIdProp) {
            console.log(chalk.green(`✓ Has FD ID property: ${fdIdProp}`));
          } else {
            console.log(chalk.red(`✗ No FD ID property found`));
          }
        }
        
      } catch (error) {
        console.log(chalk.red(`✗ Error checking children: ${error.message}`));
      }
    }
    
  } catch (error) {
    spinner.fail(`Error searching for Hiya pages: ${error.message}`);
    throw error;
  }
}

// Main function
async function main() {
  try {
    console.log(chalk.green.bold('🔍 Debug: Finding Hiya Pages\n'));
    await debugHiyaPages();
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    process.exit(1);
  }
}

// Check for environment variable and run
if (!process.env.NOTION_TOKEN) {
  console.log(chalk.red('Error: NOTION_TOKEN not found in environment variables.'));
  console.log(chalk.yellow('Please create a .env file with your Notion integration token:'));
  console.log(chalk.cyan('  NOTION_TOKEN=your_integration_token_here'));
  process.exit(1);
}

main();