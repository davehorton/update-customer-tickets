#!/usr/bin/env node

import { Client } from '@notionhq/client';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

dotenv.config();

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

async function checkHiyaPermissions() {
  const hiyaPageId = '257f2e46-adcf-8072-b68c-dc12b988577e';
  const spinner = ora('Checking Hiya page permissions...').start();
  
  try {
    // Try to get the page directly
    const page = await notion.pages.retrieve({
      page_id: hiyaPageId
    });
    
    console.log(chalk.green('\n✓ Can access Hiya page directly'));
    
    // Try to get children with more details
    const children = await notion.blocks.children.list({
      block_id: hiyaPageId,
    });
    
    spinner.succeed(`Found ${children.results.length} blocks on Hiya page`);
    
    console.log(chalk.cyan('\nBlock details:'));
    children.results.forEach((block, idx) => {
      console.log(chalk.white(`${idx + 1}. Type: ${block.type}`));
      
      if (block.type === 'child_page') {
        console.log(chalk.green(`   ✓ Child page: ${block.child_page?.title || 'Untitled'}`));
      } else if (block.type === 'child_database') {
        console.log(chalk.blue(`   ✓ Child database`));
      } else {
        console.log(chalk.gray(`   - Other block type: ${block.type}`));
      }
    });
    
    // Check if there are more pages
    if (children.has_more) {
      console.log(chalk.yellow('\n⚠️ There are more blocks that weren\'t retrieved'));
    }
    
  } catch (error) {
    spinner.fail(`Error checking Hiya page: ${error.message}`);
    console.log(chalk.red(`Error details: ${error.body || error.stack}`));
  }
}

checkHiyaPermissions();