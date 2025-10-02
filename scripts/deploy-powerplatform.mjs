#!/usr/bin/env node

/**
 * Power Platform Deployment Helper Script
 * 
 * This script assists with deploying the HumanAI Convention web app
 * to Microsoft Power Platform (Power Pages).
 * 
 * Usage:
 *   node scripts/deploy-powerplatform.mjs [options]
 * 
 * Options:
 *   --environment, -e  Target environment (default: HumanAI-Pages-Dev)
 *   --build, -b        Build before deploying (default: false)
 *   --verify, -v       Verify deployment after upload (default: true)
 *   --dry-run         Show what would be deployed without deploying
 *   --help, -h        Show this help message
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  environment: 'HumanAI-Pages-Dev',
  build: false,
  verify: true,
  dryRun: false,
  help: false
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  switch (arg) {
    case '--environment':
    case '-e':
      options.environment = args[++i];
      break;
    case '--build':
    case '-b':
      options.build = true;
      break;
    case '--no-verify':
      options.verify = false;
      break;
    case '--dry-run':
      options.dryRun = true;
      break;
    case '--help':
    case '-h':
      options.help = true;
      break;
  }
}

function showHelp() {
  console.log(`
Power Platform Deployment Helper

Usage:
  node scripts/deploy-powerplatform.mjs [options]

Options:
  --environment, -e  Target environment (default: HumanAI-Pages-Dev)
  --build, -b        Build before deploying (default: false)
  --verify, -v       Verify deployment after upload (default: true)
  --no-verify        Skip post-deployment verification
  --dry-run          Show what would be deployed without deploying
  --help, -h         Show this help message

Examples:
  # Deploy to default environment
  node scripts/deploy-powerplatform.mjs

  # Build and deploy to specific environment
  node scripts/deploy-powerplatform.mjs --build --environment HumanAI-Pages-Prod

  # Dry run (preview deployment)
  node scripts/deploy-powerplatform.mjs --dry-run

Environment Variables:
  POWERPLATFORM_TENANT_ID       - Azure AD Tenant ID
  POWERPLATFORM_CLIENT_ID       - Service Principal Client ID
  POWERPLATFORM_CLIENT_SECRET   - Service Principal Secret
  POWERPLATFORM_ENVIRONMENT_URL - Environment URL
`);
}

if (options.help) {
  showHelp();
  process.exit(0);
}

// Load configuration
let config;
const configPath = join(rootDir, 'power-pages.config.json');

if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
    console.log(`✅ Loaded configuration from power-pages.config.json`);
  } catch (error) {
    console.error(`❌ Failed to parse power-pages.config.json: ${error.message}`);
    process.exit(1);
  }
} else {
  console.warn(`⚠️ power-pages.config.json not found, using defaults`);
  config = {
    environmentName: options.environment,
    deployment: {
      sourcePath: 'web/dist'
    }
  };
}

// Verify prerequisites
function checkPrerequisites() {
  console.log('\n📋 Checking prerequisites...');
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(`  Node.js: ${nodeVersion}`);
  
  // Check if PAC CLI is installed
  try {
    const pacVersion = execSync('pac --version', { encoding: 'utf8', stdio: 'pipe' });
    console.log(`  Power Platform CLI: ${pacVersion.trim()}`);
  } catch (error) {
    console.error(`  ❌ Power Platform CLI not found`);
    console.error(`     Install it with: npm install -g @microsoft/powerplatform-cli-wrapper`);
    return false;
  }
  
  // Check environment variables
  const requiredEnvVars = [
    'POWERPLATFORM_TENANT_ID',
    'POWERPLATFORM_CLIENT_ID',
    'POWERPLATFORM_CLIENT_SECRET',
    'POWERPLATFORM_ENVIRONMENT_URL'
  ];
  
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`  ❌ Missing environment variables: ${missingVars.join(', ')}`);
    console.error(`     See DEPLOY_POWERPLATFORM.md for setup instructions`);
    return false;
  }
  
  console.log(`  ✅ Environment variables configured`);
  return true;
}

// Build the application
function buildApplication() {
  console.log('\n🔨 Building application...');
  
  try {
    execSync('npm run build', {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_DEPLOYMENT_TARGET: 'powerplatform',
        VITE_POWERPLATFORM_ENVIRONMENT: options.environment
      }
    });
    console.log('✅ Build completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Build failed');
    return false;
  }
}

// Get deployment statistics
function getDeploymentStats(distPath) {
  console.log('\n📊 Deployment statistics:');
  
  if (!existsSync(distPath)) {
    console.error(`  ❌ Distribution directory not found: ${distPath}`);
    return null;
  }
  
  let totalFiles = 0;
  let totalSize = 0;
  const fileTypes = {};
  
  function walkDir(dir) {
    const files = readdirSync(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      
      if (stat.isDirectory()) {
        walkDir(filePath);
      } else {
        totalFiles++;
        totalSize += stat.size;
        
        const ext = file.split('.').pop() || 'no-ext';
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      }
    }
  }
  
  walkDir(distPath);
  
  console.log(`  Total files: ${totalFiles}`);
  console.log(`  Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  File types:`, fileTypes);
  
  return { totalFiles, totalSize, fileTypes };
}

// Authenticate to Power Platform
function authenticate() {
  console.log('\n🔐 Authenticating to Power Platform...');
  
  if (options.dryRun) {
    console.log('  [DRY RUN] Would authenticate with service principal');
    return true;
  }
  
  try {
    const authCmd = `pac auth create --tenant "${process.env.POWERPLATFORM_TENANT_ID}" --applicationId "${process.env.POWERPLATFORM_CLIENT_ID}" --clientSecret "${process.env.POWERPLATFORM_CLIENT_SECRET}" --environment "${process.env.POWERPLATFORM_ENVIRONMENT_URL}" --name "deploy-script-${Date.now()}"`;
    
    execSync(authCmd, { stdio: 'pipe' });
    console.log('✅ Authentication successful');
    return true;
  } catch (error) {
    console.error('❌ Authentication failed');
    console.error(error.message);
    return false;
  }
}

// Deploy to Power Pages
function deployToPowerPages(distPath) {
  console.log('\n🚀 Deploying to Power Pages...');
  console.log(`  Environment: ${options.environment}`);
  console.log(`  Source path: ${distPath}`);
  
  if (options.dryRun) {
    console.log('  [DRY RUN] Would upload files to Power Pages');
    return true;
  }
  
  try {
    // Upload site content
    const uploadCmd = `pac paportal upload --path "${distPath}" --deploymentProfile Production`;
    execSync(uploadCmd, { stdio: 'inherit' });
    
    console.log('✅ Deployment successful');
    return true;
  } catch (error) {
    console.error('❌ Deployment failed');
    console.error(error.message);
    return false;
  }
}

// Verify deployment
function verifyDeployment(siteUrl) {
  console.log('\n✅ Verifying deployment...');
  console.log(`  Site URL: ${siteUrl}`);
  
  if (options.dryRun) {
    console.log('  [DRY RUN] Would verify site is accessible');
    return true;
  }
  
  try {
    // Use curl to check if site is accessible
    const curlCmd = `curl -s -o /dev/null -w "%{http_code}" "${siteUrl}"`;
    const httpCode = execSync(curlCmd, { encoding: 'utf8' }).trim();
    
    if (httpCode === '200' || httpCode === '304') {
      console.log(`  ✅ Site is accessible (HTTP ${httpCode})`);
      
      // Check version.json
      try {
        const versionUrl = `${siteUrl}/version.json`;
        const versionCode = execSync(`curl -s -o /dev/null -w "%{http_code}" "${versionUrl}"`, { encoding: 'utf8' }).trim();
        
        if (versionCode === '200') {
          console.log(`  ✅ version.json accessible`);
        } else {
          console.log(`  ⚠️ version.json returned HTTP ${versionCode}`);
        }
      } catch (error) {
        console.log(`  ⚠️ Could not verify version.json`);
      }
      
      return true;
    } else {
      console.log(`  ⚠️ Site returned HTTP ${httpCode} - may need time to propagate`);
      return false;
    }
  } catch (error) {
    console.error('  ❌ Verification failed');
    console.error(error.message);
    return false;
  }
}

// Main execution
async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Power Platform Deployment Helper                 ║');
  console.log('║  HumanAI Convention                                ║');
  console.log('╚════════════════════════════════════════════════════╝');
  
  if (options.dryRun) {
    console.log('\n⚠️ DRY RUN MODE - No actual deployment will occur\n');
  }
  
  // Step 1: Check prerequisites
  if (!checkPrerequisites()) {
    console.error('\n❌ Prerequisites check failed. Exiting.');
    process.exit(1);
  }
  
  // Step 2: Build if requested
  if (options.build) {
    if (!buildApplication()) {
      console.error('\n❌ Build failed. Exiting.');
      process.exit(1);
    }
  }
  
  // Step 3: Get deployment path
  const distPath = join(rootDir, config.deployment?.sourcePath || 'web/dist');
  
  // Step 4: Get deployment statistics
  const stats = getDeploymentStats(distPath);
  if (!stats) {
    console.error('\n❌ Could not gather deployment statistics. Exiting.');
    process.exit(1);
  }
  
  // Step 5: Authenticate
  if (!authenticate()) {
    console.error('\n❌ Authentication failed. Exiting.');
    process.exit(1);
  }
  
  // Step 6: Deploy
  if (!deployToPowerPages(distPath)) {
    console.error('\n❌ Deployment failed. Exiting.');
    process.exit(1);
  }
  
  // Step 7: Verify (if enabled)
  if (options.verify) {
    const siteUrl = config.siteUrl || `https://${options.environment.toLowerCase()}.powerappsportals.com`;
    
    // Wait a bit for propagation
    if (!options.dryRun) {
      console.log('\n⏳ Waiting 30 seconds for deployment to propagate...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    verifyDeployment(siteUrl);
  }
  
  // Success summary
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  Deployment Summary                                ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`  Environment: ${options.environment}`);
  console.log(`  Files deployed: ${stats.totalFiles}`);
  console.log(`  Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Site URL: ${config.siteUrl || 'See Power Platform Admin Center'}`);
  
  if (options.dryRun) {
    console.log('\n✅ Dry run completed successfully (no actual deployment)');
  } else {
    console.log('\n✅ Deployment completed successfully');
  }
  
  console.log('\n📚 Next steps:');
  console.log('  1. Verify site functionality in your browser');
  console.log('  2. Check Power Platform Admin Center for logs');
  console.log('  3. Monitor site performance and errors');
}

// Run main function
main().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
