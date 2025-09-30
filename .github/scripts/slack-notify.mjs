#!/usr/bin/env node
import https from 'node:https';
import { URL } from 'node:url';
import fs from 'node:fs';

/*
  Lightweight Slack Incoming Webhook helper.
  Usage examples:
    node .github/scripts/slack-notify.mjs \
      --webhook "$SLACK_WEBHOOK_URL" \
      --event quality \
      --status success \
      --summary-file web/problem-budget-summary.json \
      --commit "$GITHUB_SHA" \
      --repo "$GITHUB_REPOSITORY" \
      --run-id "$GITHUB_RUN_ID" \
      --workflow "$GITHUB_WORKFLOW"

    node .github/scripts/slack-notify.mjs \
      --webhook "$SLACK_WEBHOOK_URL" \
      --event deploy \
      --status success \
      --url "$DEPLOY_URL" \
      --commit "$GITHUB_SHA"

  Events supported: quality, deploy, verify, lighthouse-warning, trend
  Future (optional) enhancement: threaded updates via bot token (not yet implemented).
*/

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = 'true';
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function buildBlocks(opts) {
  const { event, status = 'info', commit, repo, url, summaryFile, runId, workflow } = opts;
  const shaShort = commit ? commit.slice(0, 7) : undefined;
  const summary = summaryFile ? readJsonSafe(summaryFile) : null;
  const runLink = (repo && runId) ? `https://github.com/${repo}/actions/runs/${runId}` : null;
  let title = '';
  let color = '#4caf50';
  let emoji = '✅';
  if (status === 'failure') { color = '#e53935'; emoji = '❌'; }
  else if (status === 'warning') { color = '#fb8c00'; emoji = '⚠️'; }

  switch (event) {
    case 'quality':
      title = `${emoji} Quality Gate ${status}`;
      break;
    case 'deploy':
      title = `${emoji} Deploy ${status}`;
      break;
    case 'verify':
      title = `${emoji} Deterministic Rebuild ${status}`;
      break;
    case 'lighthouse-warning':
      title = `${emoji} Lighthouse Warning`;
      break;
    default:
      title = `${emoji} ${event}`;
  }

  const fields = [];
  if (shaShort) fields.push({ type: 'mrkdwn', text: `*Commit:* 
\`${shaShort}\`` });
  if (url) fields.push({ type: 'mrkdwn', text: `*URL:* \n${url}` });
  if (runLink) fields.push({ type: 'mrkdwn', text: `*Run:* \n<${runLink}|workflow>` });
  if (workflow) fields.push({ type: 'mrkdwn', text: `*Workflow:* \n${workflow}` });

  if (summary && (event === 'quality' || event === 'trend')) {
    const { lintErrors, lintWarnings, testFailures, testsTotal, bundle } = summary;
    fields.push({ type: 'mrkdwn', text: `*Tests:* ${testsTotal ?? '?'} (fail ${testFailures ?? 0})` });
    fields.push({ type: 'mrkdwn', text: `*Lint:* ${lintErrors ?? 0} err / ${lintWarnings ?? 0} warn` });
    if (bundle && typeof bundle.totalBytes === 'number') {
      fields.push({ type: 'mrkdwn', text: `*Bundle:* ${(bundle.totalBytes/1024).toFixed(1)} KB` });
    }
    if (typeof summary.coveragePercent === 'number') {
      fields.push({ type: 'mrkdwn', text: `*Coverage:* ${summary.coveragePercent.toFixed(1)}%` });
    }
  }

  if (summary && event === 'deploy') {
    if (summary.bundle && summary.bundle.totalBytes) {
      fields.push({ type: 'mrkdwn', text: `*Bundle:* ${(summary.bundle.totalBytes/1024).toFixed(1)} KB` });
    }
  }

  let textIntro = title;
  if (status === 'failure' && summary && summary.errors) {
    const first = summary.errors.slice(0, 3).join(' | ');
    textIntro += ` — ${first}`;
  }

  return {
    attachments: [
      {
        color,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
          { type: 'section', fields },
          ...(summary && summary.exceeded && summary.exceeded.length ? [{
            type: 'section',
            text: { type: 'mrkdwn', text: `*Exceeded:* ${summary.exceeded.join(', ')}` }
          }] : []),
        ]
      }
    ]
  };
}

function post(webhook, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhook);
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) return resolve(body || 'ok');
        reject(new Error(`Slack webhook failed: ${res.statusCode} ${body}`));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const { webhook, event, status, summaryFile } = args;
  if (!webhook) throw new Error('Missing --webhook');
  if (!event) throw new Error('Missing --event');
  const payload = buildBlocks({ ...args });
  // Optionally attach raw summary snippet (truncated) for failures
  try {
    if (status === 'failure' && summaryFile) {
      const raw = fs.readFileSync(summaryFile, 'utf-8');
      if (raw.length < 12000) {
        payload.text = (payload.text || '') + '\n```' + raw.slice(0, 3500) + '```';
      }
    }
  } catch {}
  await post(webhook, payload);
  console.log(`Sent Slack ${event} (${status})`);
}

main().catch(e => { console.error(e); process.exit(1); });
