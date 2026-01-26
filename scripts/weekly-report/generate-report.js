#!/usr/bin/env node

import { graphql } from '@octokit/graphql';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PROJECT_ID = 'PVT_kwDOCCE0ds4BLZBC';
const ANNOUNCEMENTS_CATEGORY_ID = 'DIC_kwDOQWkn1c4C1bXC';
const REPO_OWNER = 'projectbluefin';
const REPO_NAME = 'common';

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${GITHUB_TOKEN}`,
  },
});

const AREA_SECTIONS = {
  desktop: {
    title: '🖥️ Desktop',
    labels: ['area/gnome', 'area/aurora', 'area/bling'],
    color: 'f5c2e7'
  },
  development: {
    title: '🛠️ Development',
    labels: ['area/dx', 'area/buildstream', 'area/finpilot'],
    color: '89dceb'
  },
  ecosystem: {
    title: '📦 Ecosystem',
    labels: ['area/brew', 'area/just', 'area/bluespeed'],
    color: 'eba0ac'
  },
  services: {
    title: '⚙️ System Services & Policies',
    labels: ['area/services', 'area/policy'],
    color: 'b4befe'
  },
  infrastructure: {
    title: '🏗️ Infrastructure',
    labels: ['area/iso', 'area/upstream'],
    color: '94e2d5'
  }
};

function getDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  return {
    start: startDate,
    end: endDate,
    startISO: startDate.toISOString(),
    endISO: endDate.toISOString(),
    startFormatted: startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    endFormatted: endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  };
}

async function getRepositoryId() {
  const query = `
    query {
      repository(owner: "${REPO_OWNER}", name: "${REPO_NAME}") {
        id
      }
    }
  `;
  
  const result = await graphqlWithAuth(query);
  return result.repository.id;
}

async function getCompletedItems(startDate) {
  let allItems = [];
  let hasNextPage = true;
  let cursor = null;
  
  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        node(id: "${PROJECT_ID}") {
          ... on ProjectV2 {
            items(first: 100, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field {
                        ... on ProjectV2SingleSelectField {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      date
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                  }
                }
                content {
                  ... on Issue {
                    number
                    title
                    url
                    repository {
                      nameWithOwner
                    }
                    author {
                      login
                    }
                    labels(first: 20) {
                      nodes {
                        name
                      }
                    }
                    closedAt
                  }
                  ... on PullRequest {
                    number
                    title
                    url
                    repository {
                      nameWithOwner
                    }
                    author {
                      login
                    }
                    labels(first: 20) {
                      nodes {
                        name
                      }
                    }
                    mergedAt
                    closedAt
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const result = await graphqlWithAuth(query, { cursor });
    const items = result.node.items;
    
    allItems.push(...items.nodes);
    hasNextPage = items.pageInfo.hasNextPage;
    cursor = items.pageInfo.endCursor;
  }
  
  const completedItems = allItems.filter(item => {
    if (!item.content) return false;
    
    const status = item.fieldValues.nodes.find(
      field => field.field?.name === 'Status'
    );
    
    if (status?.name !== 'Done') return false;
    
    const completedDate = item.content.mergedAt || item.content.closedAt;
    if (!completedDate) return false;
    
    const completed = new Date(completedDate);
    return completed >= new Date(startDate);
  });
  
  return completedItems;
}

function categorizeItems(items) {
  const categorized = {};
  const uncategorized = [];
  
  for (const section of Object.keys(AREA_SECTIONS)) {
    categorized[section] = [];
  }
  
  for (const item of items) {
    if (!item.content) continue;
    
    const labels = item.content.labels.nodes.map(l => l.name);
    let foundCategory = false;
    
    for (const [section, config] of Object.entries(AREA_SECTIONS)) {
      if (config.labels.some(label => labels.includes(label))) {
        categorized[section].push({ ...item, labels });
        foundCategory = true;
        break;
      }
    }
    
    if (!foundCategory) {
      uncategorized.push({ ...item, labels });
    }
  }
  
  return { categorized, uncategorized };
}

function extractContributors(items) {
  const contributors = new Set();
  const contributorData = new Map();
  
  for (const item of items) {
    if (!item.content?.author?.login) continue;
    
    const login = item.content.author.login;
    contributors.add(login);
    
    if (!contributorData.has(login)) {
      contributorData.set(login, {
        login,
        contributions: []
      });
    }
    
    contributorData.get(login).contributions.push({
      type: item.content.mergedAt ? 'PR' : 'Issue',
      number: item.content.number,
      title: item.content.title,
      url: item.content.url,
      repo: item.content.repository.nameWithOwner
    });
  }
  
  return { contributors: Array.from(contributors), contributorData };
}

function generateBadges(labels, color) {
  return labels
    .map(label => `[![${label}](https://img.shields.io/badge/${encodeURIComponent(label.replace('/', '%2F'))}-${color}?style=flat-square)](https://github.com/${REPO_OWNER}/${REPO_NAME}/labels/${encodeURIComponent(label)})`)
    .join(' ');
}

function formatItem(item) {
  const content = item.content;
  const type = content.mergedAt ? 'PR' : 'Issue';
  const kindLabel = item.labels.find(l => l.startsWith('kind/'));
  const kind = kindLabel ? kindLabel.replace('kind/', '') : '';
  
  let line = '';
  if (kind) {
    line += `${kind}: `;
  }
  line += content.title;
  line += ` - ${type}: [#${content.number}](${content.url})`;
  if (content.repository.nameWithOwner !== `${REPO_OWNER}/${REPO_NAME}`) {
    line += ` (${content.repository.nameWithOwner})`;
  }
  if (content.author?.login) {
    line += ` - @${content.author.login}`;
  }
  
  return line;
}

function generateReport(dateRange, items, contributors) {
  const { categorized } = categorizeItems(items);
  const { contributors: contributorList } = extractContributors(items);
  
  let report = `# Weekly Status Report: ${dateRange.startFormatted} - ${dateRange.endFormatted}\n\n`;
  report += `> Automated summary of completed items from the [Bluefin Project Board](https://github.com/orgs/projectbluefin/projects/2)\n\n`;
  
  report += `## 📊 Summary\n`;
  report += `- **${items.length}** items completed\n`;
  report += `- **${contributorList.length}** contributors\n\n`;
  
  report += `---\n\n`;
  
  for (const [section, config] of Object.entries(AREA_SECTIONS)) {
    const sectionItems = categorized[section];
    if (sectionItems.length === 0) continue;
    
    report += `## ${config.title}\n`;
    report += `${generateBadges(config.labels, config.color)}\n\n`;
    
    for (const item of sectionItems) {
      report += `- ${formatItem(item)}\n`;
    }
    
    report += `\n`;
  }
  
  report += `---\n\n`;
  report += `## 👏 Contributors\n\n`;
  report += `Thank you to everyone who contributed this week!\n\n`;
  
  for (const login of contributorList.sort()) {
    report += `- [@${login}](https://github.com/${login})\n`;
  }
  
  report += `\n---\n\n`;
  report += `<sub>Generated on ${dateRange.endFormatted} | `;
  report += `[Project Board](https://github.com/orgs/projectbluefin/projects/2) | `;
  report += `[Report Issue](https://github.com/${REPO_OWNER}/${REPO_NAME}/issues/new)</sub>\n`;
  
  return report;
}

async function postToDiscussions(repositoryId, title, body) {
  const mutation = `
    mutation {
      createDiscussion(input: {
        repositoryId: "${repositoryId}",
        categoryId: "${ANNOUNCEMENTS_CATEGORY_ID}",
        title: "${title.replace(/"/g, '\\"')}",
        body: "${body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
      }) {
        discussion {
          id
          url
        }
      }
    }
  `;
  
  const result = await graphqlWithAuth(mutation);
  return result.createDiscussion.discussion;
}

async function main() {
  try {
    console.log('Generating weekly status report...\n');
    
    const dateRange = getDateRange();
    console.log(`Date range: ${dateRange.startFormatted} - ${dateRange.endFormatted}`);
    
    console.log('Fetching repository ID...');
    const repositoryId = await getRepositoryId();
    
    console.log('Fetching completed items from project board...');
    const items = await getCompletedItems(dateRange.startISO);
    console.log(`Found ${items.length} completed items`);
    
    if (items.length === 0) {
      console.log('No completed items found. Skipping report generation.');
      return;
    }
    
    console.log('Extracting contributors...');
    const { contributors } = extractContributors(items);
    console.log(`Found ${contributors.length} contributors`);
    
    console.log('Generating report...');
    const report = generateReport(dateRange, items, contributors);
    
    console.log('\n--- Generated Report ---\n');
    console.log(report);
    console.log('\n--- End Report ---\n');
    
    console.log('Posting to GitHub Discussions...');
    const title = `Weekly Status Report: ${dateRange.startFormatted} - ${dateRange.endFormatted}`;
    const discussion = await postToDiscussions(repositoryId, title, report);
    
    console.log(`✅ Report posted successfully!`);
    console.log(`URL: ${discussion.url}`);
    
  } catch (error) {
    console.error('Error generating report:', error);
    if (error.errors) {
      console.error('GraphQL errors:', JSON.stringify(error.errors, null, 2));
    }
    process.exit(1);
  }
}

main();
