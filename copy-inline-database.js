#!/usr/bin/env node

import { Client } from '@notionhq/client';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

dotenv.config();

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// Find the Kore page and get its inline database structure
async function getKoreInlineDatabase() {
  const spinner = ora('Finding Kore page...').start();
  
  try {
    // Search for the Kore page
    const response = await notion.search({
      query: 'Kore',
      filter: {
        property: 'object',
        value: 'page'
      },
    });
    
    // Since the title might show as "Untitled", let's check the URL or just use the first result
    const korePage = response.results.find(page => 
      page.url?.includes('Kore') || 
      page.properties?.title?.title?.[0]?.plain_text?.toLowerCase().includes('kore')
    ) || response.results[0]; // Use first result if no URL match
    
    if (!korePage) {
      spinner.fail('Could not find Kore page');
      return null;
    }
    
    spinner.text = `Found Kore page (${korePage.id})`;
    
    spinner.text = 'Getting Kore page blocks...';
    
    // Get all blocks from the Kore page
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
    
    // Find the child_database block
    const inlineDatabase = blocks.find(block => block.type === 'child_database');
    
    if (!inlineDatabase) {
      spinner.fail('Could not find inline database in Kore page');
      return null;
    }
    
    // Get the database details
    const database = await notion.databases.retrieve({
      database_id: inlineDatabase.id
    });
    
    spinner.succeed(`Found inline database: ${database.title?.[0]?.plain_text || 'Untitled'}`);
    
    return {
      korePage,
      database,
      inlineDatabase
    };
    
  } catch (error) {
    spinner.fail(`Error: ${error.message}`);
    throw error;
  }
}

// Find the customers database and get qualifying pages
async function findQualifyingCustomerPages() {
  const spinner = ora('Finding customer database...').start();
  
  try {
    // Search for databases that might be the customers database
    const response = await notion.search({
      filter: {
        property: 'object',
        value: 'database'
      },
    });
    
    // Look for a database that likely contains customer data
    let customersDatabase = null;
    for (const db of response.results) {
      const dbName = db.title?.[0]?.plain_text?.toLowerCase() || '';
      if (dbName.includes('customer') || dbName.includes('client') || dbName.includes('company')) {
        // Check if it has an FD ID property
        const properties = Object.keys(db.properties);
        const hasFdId = properties.some(prop => 
          prop.toLowerCase().includes('fd') && prop.toLowerCase().includes('id')
        );
        
        if (hasFdId) {
          customersDatabase = db;
          break;
        }
      }
    }
    
    if (!customersDatabase) {
      spinner.fail('Could not find customers database with FD ID property');
      return [];
    }
    
    spinner.text = `Found customers database: ${customersDatabase.title?.[0]?.plain_text}`;
    
    // Query the database for entries
    const entries = [];
    let cursor = undefined;
    
    do {
      const queryResponse = await notion.databases.query({
        database_id: customersDatabase.id,
        start_cursor: cursor,
      });
      
      entries.push(...queryResponse.results);
      cursor = queryResponse.has_more ? queryResponse.next_cursor : undefined;
    } while (cursor);
    
    spinner.text = 'Filtering customers with FD ID and child pages...';
    
    // Filter entries that have FD ID and check for child pages
    const qualifyingPages = [];
    
    for (const entry of entries) {
      // Check if has FD ID value
      const fdIdProperty = Object.entries(entry.properties).find(([key, prop]) => 
        key.toLowerCase().includes('fd') && key.toLowerCase().includes('id')
      );
      
      if (!fdIdProperty || !fdIdProperty[1]?.rich_text?.[0]?.plain_text) {
        continue; // Skip if no FD ID
      }
      
      // Check if page has child pages
      try {
        const children = await notion.blocks.children.list({
          block_id: entry.id,
        });
        
        const hasChildPages = children.results.some(block => block.type === 'child_page');
        
        if (hasChildPages) {
          const customerName = entry.properties?.Name?.title?.[0]?.plain_text || 
                             entry.properties?.Company?.title?.[0]?.plain_text ||
                             entry.properties?.Title?.title?.[0]?.plain_text ||
                             'Unnamed Customer';
          
          qualifyingPages.push({
            id: entry.id,
            name: customerName,
            fdId: fdIdProperty[1].rich_text[0].plain_text,
            pageEntry: entry // Keep full entry for relation filtering
          });
        }
      } catch (error) {
        // Skip if can't access page
        continue;
      }
    }
    
    spinner.succeed(`Found ${qualifyingPages.length} qualifying customer pages`);
    return qualifyingPages;
    
  } catch (error) {
    spinner.fail(`Error finding customer pages: ${error.message}`);
    throw error;
  }
}

// Create inline database on a target page with customer-specific filtering
async function createInlineDatabase(pageId, customer, databaseStructure) {
  const spinner = ora(`Creating filtered database for ${customer.name}...`).start();
  
  try {
    // Create the database as a child of the page
    const newDatabase = await notion.databases.create({
      parent: {
        type: 'page_id',
        page_id: pageId
      },
      title: databaseStructure.title,
      properties: databaseStructure.properties,
      // Add a filter to show only tickets for this customer
      filter: {
        and: [
          {
            property: "Customer", // Adjust this property name if different
            relation: {
              contains: customer.pageEntry.id
            }
          }
        ]
      }
    });
    
    spinner.succeed(`Created filtered database for ${customer.name}`);
    return newDatabase;
    
  } catch (error) {
    // If filter fails, try without it and warn user
    try {
      spinner.text = `Creating database without filter for ${customer.name}...`;
      const newDatabase = await notion.databases.create({
        parent: {
          type: 'page_id',
          page_id: pageId
        },
        title: databaseStructure.title,
        properties: databaseStructure.properties
      });
      
      spinner.warn(`Created database for ${customer.name} - MANUAL FILTER NEEDED`);
      console.log(chalk.yellow(`   ⚠️  You'll need to manually add a filter for customer: ${customer.name} (FD ID: ${customer.fdId})`));
      return newDatabase;
    } catch (secondError) {
      spinner.fail(`Failed to create database for ${customer.name}: ${secondError.message}`);
      throw secondError;
    }
  }
}

// Check if page already has an inline database
async function pageHasInlineDatabase(pageId) {
  try {
    const blocks = await notion.blocks.children.list({
      block_id: pageId,
    });
    
    return blocks.results.some(block => block.type === 'child_database');
  } catch (error) {
    return false;
  }
}

// Main function
async function main() {
  try {
    console.log(chalk.green.bold('🔄 Copying Filtered Inline Databases to Customer Pages\n'));
    console.log(chalk.cyan('Targeting: Pages with FD ID property + child pages'));
    console.log(chalk.cyan('Each database will be filtered to show only that customer\'s tickets\n'));
    
    // Step 1: Get the Kore inline database structure
    const koreData = await getKoreInlineDatabase();
    if (!koreData) return;
    
    // Step 2: Find qualifying customer pages
    const customerPages = await findQualifyingCustomerPages();
    
    if (customerPages.length === 0) {
      console.log(chalk.yellow('No qualifying customer pages found.'));
      console.log(chalk.dim('Looking for pages with: FD ID property + child pages'));
      return;
    }
    
    // Step 3: Show qualifying pages
    console.log(chalk.cyan('\nQualifying customer pages:'));
    customerPages.forEach((page, index) => {
      console.log(`  ${index + 1}. ${chalk.bold(page.name)} ${chalk.dim(`(FD ID: ${page.fdId})`)}`);
    });
    
    console.log(chalk.yellow('\n🧪 TEST MODE: Will process only the FIRST customer for testing.'));
    console.log(chalk.yellow('Each database will only show tickets for that specific customer.\n'));
    
    // Interactive prompt
    console.log(chalk.cyan('Press ENTER to continue or Ctrl+C to cancel...'));
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    await new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        
        // Check if user pressed Ctrl+C
        if (data[0] === 3) {
          console.log(chalk.yellow('\nCancelled by user.'));
          process.exit(0);
        }
        
        resolve();
      });
    });
    
    // Step 4: Create databases on customer pages (TEST MODE - first customer only)
    let created = 0;
    let skipped = 0;
    let needsManualFilter = 0;
    
    // TEST MODE: Only process the first customer
    const testCustomers = customerPages.slice(0, 1);
    console.log(chalk.blue(`\n🧪 Processing ${testCustomers[0].name} for testing...\n`));
    
    for (const customer of testCustomers) {
      // Check if page already has an inline database
      if (await pageHasInlineDatabase(customer.id)) {
        console.log(chalk.dim(`⏭️  Skipping ${customer.name} (already has inline database)`));
        skipped++;
        continue;
      }
      
      // Create the filtered database
      try {
        await createInlineDatabase(customer.id, customer, {
          title: koreData.database.title,
          properties: koreData.database.properties
        });
        created++;
      } catch (error) {
        console.log(chalk.red(`❌ Failed for ${customer.name}: ${error.message}`));
        needsManualFilter++;
      }
    }
    
    console.log(chalk.green.bold(`\n✅ Complete!`));
    console.log(chalk.green(`   Created: ${created} filtered databases`));
    console.log(chalk.yellow(`   Skipped: ${skipped} pages (already had databases)`));
    if (needsManualFilter > 0) {
      console.log(chalk.red(`   Manual filter needed: ${needsManualFilter} databases`));
    }
    
    if (created > 0) {
      console.log(chalk.cyan('\n📋 What was created:'));
      console.log('   ✓ Inline databases with same structure as Kore page');
      console.log('   ✓ Customer-specific filtering (where possible)');
      console.log('   ✓ All original properties and relations preserved');
      
      if (needsManualFilter > 0) {
        console.log(chalk.yellow('\n⚠️  Manual steps needed:'));
        console.log('   - For databases marked "MANUAL FILTER NEEDED":');
        console.log('   - Open the database view');
        console.log('   - Add a filter: Customer relation contains [customer name]');
      }
    }
    
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