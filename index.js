#!/usr/bin/env node

import { Client } from '@notionhq/client';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';
import Table from 'cli-table3';

// Load environment variables
dotenv.config();

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// Helper function to search for database by name
async function findDatabaseByName(name) {
  const spinner = ora('Searching for database...').start();
  
  try {
    const response = await notion.search({
      query: name,
      filter: {
        property: 'object',
        value: 'database'
      },
    });
    
    spinner.stop();
    
    const databases = response.results.filter(
      db => db.title?.[0]?.plain_text?.toLowerCase().includes(name.toLowerCase())
    );
    
    if (databases.length === 0) {
      console.log(chalk.yellow(`No database found with name containing "${name}"`));
      return null;
    }
    
    if (databases.length > 1) {
      console.log(chalk.yellow(`Found ${databases.length} databases:`));
      databases.forEach((db, index) => {
        console.log(`  ${index + 1}. ${db.title?.[0]?.plain_text} (${db.id})`);
      });
      console.log(chalk.cyan('Using the first one. Specify ID for exact match.'));
    }
    
    return databases[0];
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

// Helper function to get database by ID or name
async function getDatabase(identifier) {
  // Check if it's a UUID (database ID)
  const uuidRegex = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  const cleanId = identifier.replace(/-/g, '');
  
  if (uuidRegex.test(identifier) || cleanId.length === 32) {
    // It's an ID, fetch directly
    try {
      return await notion.databases.retrieve({ database_id: identifier });
    } catch (error) {
      if (error.code === 'object_not_found') {
        console.log(chalk.red(`Database with ID "${identifier}" not found`));
        return null;
      }
      throw error;
    }
  } else {
    // It's a name, search for it
    return await findDatabaseByName(identifier);
  }
}

// Helper function to format property value
function formatPropertyValue(property) {
  if (!property) return '';
  
  switch (property.type) {
    case 'title':
      return property.title.map(t => t.plain_text).join('');
    case 'rich_text':
      return property.rich_text.map(t => t.plain_text).join('');
    case 'number':
      return property.number?.toString() || '';
    case 'select':
      return property.select?.name || '';
    case 'multi_select':
      return property.multi_select.map(s => s.name).join(', ');
    case 'date':
      if (property.date?.start) {
        const end = property.date.end ? ` → ${property.date.end}` : '';
        return `${property.date.start}${end}`;
      }
      return '';
    case 'people':
      return property.people.map(p => p.name || p.id).join(', ');
    case 'files':
      return property.files.map(f => f.name).join(', ');
    case 'checkbox':
      return property.checkbox ? '✓' : '✗';
    case 'url':
      return property.url || '';
    case 'email':
      return property.email || '';
    case 'phone_number':
      return property.phone_number || '';
    case 'formula':
      return formatPropertyValue({ type: property.formula.type, [property.formula.type]: property.formula[property.formula.type] });
    case 'relation':
      return property.relation.map(r => r.id).join(', ');
    case 'rollup':
      if (property.rollup.type === 'array') {
        return property.rollup.array.map(item => formatPropertyValue(item)).join(', ');
      }
      return formatPropertyValue({ type: property.rollup.type, [property.rollup.type]: property.rollup[property.rollup.type] });
    case 'created_time':
      return property.created_time;
    case 'created_by':
      return property.created_by.name || property.created_by.id;
    case 'last_edited_time':
      return property.last_edited_time;
    case 'last_edited_by':
      return property.last_edited_by.name || property.last_edited_by.id;
    case 'status':
      return property.status?.name || '';
    default:
      return JSON.stringify(property);
  }
}

// Helper function to get page children (blocks)
async function getPageChildren(pageId, indent = 0) {
  const blocks = [];
  let cursor = undefined;
  
  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
    });
    
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  
  const formattedBlocks = [];
  
  for (const block of blocks) {
    const indentStr = '  '.repeat(indent);
    let content = '';
    
    switch (block.type) {
      case 'paragraph':
        content = block.paragraph.rich_text.map(t => t.plain_text).join('');
        break;
      case 'heading_1':
        content = chalk.bold(`# ${block.heading_1.rich_text.map(t => t.plain_text).join('')}`);
        break;
      case 'heading_2':
        content = chalk.bold(`## ${block.heading_2.rich_text.map(t => t.plain_text).join('')}`);
        break;
      case 'heading_3':
        content = chalk.bold(`### ${block.heading_3.rich_text.map(t => t.plain_text).join('')}`);
        break;
      case 'bulleted_list_item':
        content = `• ${block.bulleted_list_item.rich_text.map(t => t.plain_text).join('')}`;
        break;
      case 'numbered_list_item':
        content = `1. ${block.numbered_list_item.rich_text.map(t => t.plain_text).join('')}`;
        break;
      case 'to_do':
        const checked = block.to_do.checked ? '✓' : '☐';
        content = `${checked} ${block.to_do.rich_text.map(t => t.plain_text).join('')}`;
        break;
      case 'toggle':
        content = `▶ ${block.toggle.rich_text.map(t => t.plain_text).join('')}`;
        break;
      case 'code':
        content = chalk.gray(`\`\`\`${block.code.language}\n${block.code.rich_text.map(t => t.plain_text).join('')}\n\`\`\``);
        break;
      case 'quote':
        content = chalk.italic(`" ${block.quote.rich_text.map(t => t.plain_text).join('')}`);
        break;
      case 'divider':
        content = '---';
        break;
      default:
        content = chalk.dim(`[${block.type}]`);
    }
    
    if (content) {
      formattedBlocks.push(indentStr + content);
    }
    
    // Recursively get children if block has children
    if (block.has_children) {
      const children = await getPageChildren(block.id, indent + 1);
      formattedBlocks.push(...children);
    }
  }
  
  return formattedBlocks;
}

// Main function to display database contents
async function displayDatabase(identifier, options) {
  try {
    // Get the database
    const database = await getDatabase(identifier);
    
    if (!database) {
      return;
    }
    
    // Display database info
    console.log(chalk.green.bold('\n📊 Database Information'));
    console.log(chalk.cyan('Name:'), database.title?.[0]?.plain_text || 'Untitled');
    console.log(chalk.cyan('ID:'), database.id);
    console.log(chalk.cyan('Created:'), new Date(database.created_time).toLocaleString());
    console.log(chalk.cyan('Last edited:'), new Date(database.last_edited_time).toLocaleString());
    
    // Get database properties
    const properties = Object.entries(database.properties);
    console.log(chalk.green.bold('\n📋 Properties:'));
    properties.forEach(([name, prop]) => {
      console.log(`  ${chalk.yellow(name)}: ${chalk.dim(prop.type)}`);
    });
    
    // Query database for entries
    const spinner = ora('Fetching database entries...').start();
    
    const entries = [];
    let cursor = undefined;
    
    do {
      const response = await notion.databases.query({
        database_id: database.id,
        start_cursor: cursor,
        page_size: options.limit || 100,
      });
      
      entries.push(...response.results);
      cursor = response.has_more && entries.length < (options.limit || Infinity) 
        ? response.next_cursor 
        : undefined;
    } while (cursor);
    
    spinner.stop();
    
    if (entries.length === 0) {
      console.log(chalk.yellow('\nNo entries found in this database.'));
      return;
    }
    
    console.log(chalk.green.bold(`\n📝 Database Entries (${entries.length} items):`));
    
    // Create table for display
    const propertyNames = Object.keys(database.properties).slice(0, options.columns || 5);
    const table = new Table({
      head: propertyNames.map(name => chalk.cyan(name)),
      wordWrap: true,
      colWidths: propertyNames.map(() => Math.floor(80 / propertyNames.length)),
    });
    
    // Add entries to table
    for (const entry of entries) {
      const row = propertyNames.map(propName => {
        const value = formatPropertyValue(entry.properties[propName]);
        return value.substring(0, 50) + (value.length > 50 ? '...' : '');
      });
      table.push(row);
    }
    
    console.log(table.toString());
    
    // Show child content if requested
    if (options.children) {
      console.log(chalk.green.bold('\n📄 Child Content:'));
      
      for (let i = 0; i < Math.min(entries.length, options.childLimit || 5); i++) {
        const entry = entries[i];
        const title = formatPropertyValue(entry.properties[propertyNames[0]]) || `Entry ${i + 1}`;
        
        console.log(chalk.yellow.bold(`\n--- ${title} ---`));
        
        try {
          const children = await getPageChildren(entry.id);
          if (children.length > 0) {
            children.forEach(child => console.log(child));
          } else {
            console.log(chalk.dim('  (No content)'));
          }
        } catch (error) {
          console.log(chalk.dim(`  (Could not fetch content: ${error.message})`));
        }
      }
      
      if (entries.length > (options.childLimit || 5)) {
        console.log(chalk.dim(`\n... and ${entries.length - (options.childLimit || 5)} more entries`));
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    if (error.code === 'unauthorized') {
      console.log(chalk.yellow('\nMake sure your NOTION_TOKEN is set correctly in the .env file'));
      console.log(chalk.yellow('and that your integration has access to the database.'));
    }
    process.exit(1);
  }
}

// CLI setup
const program = new Command();

program
  .name('notion-cli')
  .description('CLI tool to interact with Notion databases')
  .version('1.0.0');

program
  .command('db <identifier>')
  .description('Retrieve and display a database by name or ID')
  .option('-l, --limit <number>', 'limit number of entries to fetch', parseInt)
  .option('-c, --columns <number>', 'number of columns to display', parseInt)
  .option('--children', 'fetch and display child content blocks')
  .option('--child-limit <number>', 'limit number of entries to show child content for', parseInt)
  .action(displayDatabase);

program
  .command('list')
  .description('List all accessible databases')
  .action(async () => {
    const spinner = ora('Searching for databases...').start();
    
    try {
      const response = await notion.search({
        filter: {
          property: 'object',
          value: 'database'
        },
      });
      
      spinner.stop();
      
      if (response.results.length === 0) {
        console.log(chalk.yellow('No databases found.'));
        return;
      }
      
      console.log(chalk.green.bold(`\n📚 Found ${response.results.length} databases:\n`));
      
      response.results.forEach((db, index) => {
        const name = db.title?.[0]?.plain_text || 'Untitled';
        console.log(`${chalk.cyan(`${index + 1}.`)} ${chalk.bold(name)}`);
        console.log(`   ${chalk.dim('ID:')} ${db.id}`);
        console.log(`   ${chalk.dim('Last edited:')} ${new Date(db.last_edited_time).toLocaleString()}\n`);
      });
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Check for environment variable
if (!process.env.NOTION_TOKEN) {
  console.log(chalk.red('Error: NOTION_TOKEN not found in environment variables.'));
  console.log(chalk.yellow('Please create a .env file with your Notion integration token:'));
  console.log(chalk.cyan('  NOTION_TOKEN=your_integration_token_here'));
  console.log(chalk.yellow('\nGet your token from: https://www.notion.so/my-integrations'));
  process.exit(1);
}

program.parse();