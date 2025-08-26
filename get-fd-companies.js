#!/usr/bin/env node

import fetch from 'node-fetch';
import chalk from 'chalk';

const FRESHDESK_API_KEY = 'e43006zmskEJubAezbr9';
const FRESHDESK_DOMAIN = 'jambonz.freshdesk.com';

async function getFreshDeskCompanies() {
  try {
    console.log(chalk.green('Fetching all FreshDesk companies...'));
    
    let allCompanies = [];
    let page = 1;
    const perPage = 100; // Maximum allowed per page
    
    while (true) {
      console.log(chalk.blue(`Fetching page ${page}...`));
      
      const response = await fetch(`https://${FRESHDESK_DOMAIN}/api/v2/companies?page=${page}&per_page=${perPage}`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(FRESHDESK_API_KEY + ':X').toString('base64')
        }
      });
      
      if (!response.ok) {
        throw new Error(`FreshDesk API error: ${response.status} ${response.statusText}`);
      }
      
      const companies = await response.json();
      
      if (companies.length === 0) {
        break; // No more pages
      }
      
      allCompanies.push(...companies);
      
      // If we got fewer than perPage results, we're on the last page
      if (companies.length < perPage) {
        break;
      }
      
      page++;
    }
    
    const companies = allCompanies;
    
    console.log(chalk.cyan(`\nFound ${companies.length} companies in FreshDesk:\n`));
    
    // Sort by name for easier matching
    companies.sort((a, b) => a.name.localeCompare(b.name));
    
    companies.forEach(company => {
      console.log(`${chalk.yellow(company.name)}: ${chalk.blue(company.id)}`);
    });
    
    console.log(chalk.green('\n📋 Copy-paste format for easy reference:'));
    companies.forEach(company => {
      console.log(`${company.name} = ${company.id}`);
    });
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

getFreshDeskCompanies();