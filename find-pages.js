#!/usr/bin/env node

import { Client } from '@notionhq/client';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

async function searchPages() {
  try {
    console.log(chalk.green('Searching for Kore page specifically...'));
    
    const response = await notion.search({
      query: 'Kore',
      filter: {
        property: 'object',
        value: 'page'
      },
    });
    
    console.log(chalk.cyan(`\nFound ${response.results.length} pages matching "Kore":\n`));
    
    if (response.results.length === 0) {
      console.log(chalk.yellow('No pages found with "Kore" in the name.'));
      console.log(chalk.dim('Let me try searching for all pages and show more details...'));
      
      // Fallback: search all pages and show detailed info
      const allPages = await notion.search({
        filter: {
          property: 'object',
          value: 'page'
        },
      });
      
      console.log(chalk.cyan(`\nAll ${allPages.results.length} pages with detailed info:\n`));
      
      for (let i = 0; i < Math.min(10, allPages.results.length); i++) {
        const page = allPages.results[i];
        console.log(`${i + 1}. ${chalk.bold('Page details:')}`);
        console.log(`   ID: ${chalk.dim(page.id)}`);
        console.log(`   Object: ${chalk.dim(page.object)}`);
        console.log(`   URL: ${chalk.dim(page.url || 'No URL')}`);
        console.log(`   Properties:`, JSON.stringify(page.properties, null, 2));
        console.log('---');
      }
      
    } else {
      response.results.forEach((page, index) => {
        const title = page.properties?.title?.title?.[0]?.plain_text || 
                     page.properties?.Name?.title?.[0]?.plain_text ||
                     'Untitled';
        console.log(`${index + 1}. ${chalk.bold(title)}`);
        console.log(`   ID: ${chalk.dim(page.id)}`);
        console.log(`   URL: ${chalk.dim(page.url || 'No URL')}`);
      });
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

searchPages();