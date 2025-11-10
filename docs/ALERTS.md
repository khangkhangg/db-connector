# Alert System Guide

Complete guide to the flexible, multi-channel alert system with PHI protection.

## Table of Contents

1. [Overview](#overview)
2. [Configuration](#configuration)
3. [Supported Channels](#supported-channels)
4. [PHI Protection](#phi-protection)
5. [Setup Guides](#setup-guides)
6. [Usage Examples](#usage-examples)
7. [Best Practices](#best-practices)

---

## Overview

The DB Schema Mapper Connector includes a **flexible, plugin-based alert system** that:

✅ **No Code Required** - Pure configuration-based setup
✅ **Multi-Channel** - Slack, Telegram, Discord, Teams, PagerDuty, Email, Webhooks
✅ **PHI Protected** - Automatic masking of Protected Health Information
✅ **Severity Filtering** - Control which alerts are sent based on severity
✅ **Per-Channel Configuration** - Different settings per alert channel
✅ **Easy to Extend** - Add new channels without code changes

---

## Configuration

### Basic Structure

```json
{
  "enabled": true,
  "severityThreshold": "medium",
  "notifyOnDrift": true,
  "notifyOnMigration": true,
  "notifyOnFailure": true,
  "maskPHI": true,
  "channels": [...]
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable/disable all alerts |
| `severityThreshold` | string | "medium" | Minimum severity: low, medium, high, critical |
| `notifyOnDrift` | boolean | true | Alert on schema drift detection |
| `notifyOnMigration` | boolean | true | Alert on migration completion |
| `notifyOnFailure` | boolean | true | Alert on failures |
| `maskPHI` | boolean | true | **Global PHI masking** - highly recommended |
| `phiFields` | string[] | [] | Additional PHI field patterns to mask |
| `channels` | array | [] | List of alert channels |

### Channel Configuration

```json
{
  "type": "telegram|slack|discord|teams|webhook|email|pagerduty|log",
  "enabled": true,
  "maskPHI": true,
  "config": {
    // Channel-specific configuration
  }
}
```

---

## Supported Channels

### 1. Telegram ✨ NEW!

**Perfect for**: Personal alerts, small teams, mobile notifications

**Configuration**:
```json
{
  "type": "telegram",
  "enabled": true,
  "maskPHI": true,
  "config": {
    "botToken": "YOUR_BOT_TOKEN",
    "chatId": "YOUR_CHAT_ID"
  }
}
```

**Setup Steps**:

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` command
3. Follow instructions to create your bot
4. Copy the bot token (looks like: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
5. Start a chat with your new bot
6. Get your chat ID:
   ```bash
   curl https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
7. Look for `"chat":{"id":YOUR_CHAT_ID}` in the response
8. Use the token and chat ID in your config

**Example Message**:
```
🚨 HIGH: Migration failed

Type: migration_failed
Time: 2024-01-15T10:30:00Z

Details:
```json
{
  "migration": "1.2.0",
  "error": "Connection timeout"
}
```

_DB Schema Mapper Connector_
```

### 2. Slack

**Perfect for**: Team collaboration, existing Slack workspaces

**Configuration**:
```json
{
  "type": "slack",
  "enabled": true,
  "maskPHI": true,
  "config": {
    "webhookUrl": "https://hooks.slack.com/services/YOUR/WEBHOOK"
  }
}
```

**Setup Steps**:

1. Go to [Slack API](https://api.slack.com/messaging/webhooks)
2. Click "Create New App" → "From scratch"
3. Enable "Incoming Webhooks"
4. Click "Add New Webhook to Workspace"
5. Select the channel to post to
6. Copy the webhook URL
7. Use the URL in your config

### 3. Discord

**Perfect for**: Community servers, developer communities

**Configuration**:
```json
{
  "type": "discord",
  "enabled": true,
  "maskPHI": true,
  "config": {
    "webhookUrl": "https://discord.com/api/webhooks/YOUR/WEBHOOK"
  }
}
```

**Setup Steps**:

1. Open Discord and go to your server
2. Right-click the channel → Edit Channel
3. Go to Integrations → Webhooks
4. Click "New Webhook"
5. Give it a name and copy the webhook URL
6. Use the URL in your config

### 4. Microsoft Teams

**Perfect for**: Enterprise organizations using Microsoft 365

**Configuration**:
```json
{
  "type": "teams",
  "enabled": true,
  "maskPHI": true,
  "config": {
    "webhookUrl": "https://outlook.office.com/webhook/YOUR/WEBHOOK"
  }
}
```

**Setup Steps**:

1. Open Microsoft Teams
2. Go to the channel where you want alerts
3. Click "..." → Connectors
4. Search for "Incoming Webhook" and configure
5. Give it a name and copy the webhook URL
6. Use the URL in your config

### 5. PagerDuty

**Perfect for**: On-call rotations, incident management

**Configuration**:
```json
{
  "type": "pagerduty",
  "enabled": true,
  "config": {
    "routingKey": "YOUR_INTEGRATION_KEY"
  }
}
```

**Setup Steps**:

1. Log in to PagerDuty
2. Go to Services → Service Directory
3. Click on your service (or create a new one)
4. Go to Integrations tab
5. Add integration → Events API V2
6. Copy the Integration Key (routing key)
7. Use the key in your config

### 6. Webhook (Custom)

**Perfect for**: Custom integrations, internal systems

**Configuration**:
```json
{
  "type": "webhook",
  "enabled": true,
  "maskPHI": true,
  "config": {
    "url": "https://your-api.com/alerts",
    "headers": {
      "Authorization": "Bearer your-token",
      "X-Custom-Header": "value"
    }
  }
}
```

**Webhook Payload**:
```json
{
  "id": "alert_123",
  "type": "migration_failed",
  "severity": "high",
  "message": "Migration failed",
  "details": { ... },
  "timestamp": "2024-01-15T10:30:00Z",
  "acknowledged": false
}
```

### 7. Email

**Perfect for**: Compliance teams, audit trails

**Configuration**:
```json
{
  "type": "email",
  "enabled": true,
  "maskPHI": false,
  "config": {
    "recipients": ["ops@example.com", "compliance@example.com"],
    "from": "alerts@example.com",
    "smtpHost": "smtp.example.com",
    "smtpPort": 587,
    "smtpUser": "alerts@example.com",
    "smtpPassword": "password"
  }
}
```

### 8. Log

**Perfect for**: Local debugging, development

**Configuration**:
```json
{
  "type": "log",
  "enabled": true,
  "config": {}
}
```

---

## PHI Protection 🔒

### What is PHI?

Protected Health Information (PHI) includes:
- Patient names, addresses, phone numbers
- Medical record numbers (MRN)
- Social Security Numbers (SSN)
- Dates of birth
- Diagnosis, medication, treatment information
- Insurance information
- Any personally identifiable health information

### Automatic PHI Masking

The alert system **automatically masks PHI** in all alerts when `maskPHI: true`:

**Original Alert**:
```json
{
  "message": "Schema changed",
  "details": {
    "patient_name": "John Doe",
    "ssn": "123-45-6789",
    "email": "john@example.com",
    "diagnosis": "Hypertension"
  }
}
```

**Masked Alert**:
```json
{
  "message": "Schema changed",
  "details": {
    "patient_name": "***PHI-REDACTED***",
    "ssn": "***-**-****",
    "email": "***@***.***",
    "diagnosis": "***PHI-REDACTED***"
  }
}
```

### Default PHI Field Patterns

The system automatically masks fields containing:
- `ssn`, `social_security`
- `dob`, `date_of_birth`, `birthdate`
- `mrn`, `medical_record`
- `patient_id`, `patient_name`
- `diagnosis`, `medication`, `treatment`
- `phone`, `telephone`, `mobile`
- `email`, `address`, `street`
- `credit_card`, `card_number`
- `password`, `token`, `secret`, `api_key`

### Custom PHI Fields

Add your own PHI field patterns:

```json
{
  "maskPHI": true,
  "phiFields": [
    "patient",
    "medical",
    "health",
    "insurance",
    "prescription",
    "lab_result"
  ]
}
```

### Per-Channel PHI Control

Override PHI masking per channel:

```json
{
  "maskPHI": true,
  "channels": [
    {
      "type": "slack",
      "enabled": true,
      "maskPHI": true
    },
    {
      "type": "email",
      "enabled": true,
      "maskPHI": false,
      "config": {
        "recipients": ["hipaa-compliance@example.com"]
      }
    }
  ]
}
```

**Use Case**: Send masked alerts to public channels (Slack, Telegram) but full details to compliance team email.

### String Pattern Masking

The system also masks PHI patterns in strings:

| Pattern | Before | After |
|---------|--------|-------|
| SSN | 123-45-6789 | ***-**-**** |
| Email | john@example.com | ***@***.*** |
| Phone | 555-123-4567 | ***-***-**** |
| Credit Card | 4532-1234-5678-9010 | ****-****-****-**** |

---

## Setup Guides

### Quick Start - Telegram Only

1. **Create configuration file** `alert-config.json`:
```json
{
  "enabled": true,
  "severityThreshold": "medium",
  "notifyOnDrift": true,
  "notifyOnMigration": true,
  "notifyOnFailure": true,
  "maskPHI": true,
  "channels": [
    {
      "type": "telegram",
      "enabled": true,
      "config": {
        "botToken": "YOUR_BOT_TOKEN",
        "chatId": "YOUR_CHAT_ID"
      }
    }
  ]
}
```

2. **Use in code**:
```typescript
import { EnhancedAlertManager } from 'db-connector';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('alert-config.json', 'utf-8'));
const alertManager = new EnhancedAlertManager(config);

// Alerts will be sent automatically on events
await alertManager.sendAlert({
  id: 'alert-123',
  type: 'migration_failed',
  severity: 'high',
  message: 'Migration 1.2.0 failed',
  details: { error: 'Connection timeout' },
  timestamp: new Date(),
  acknowledged: false
});
```

**That's it! No additional code needed.** 🎉

### Multi-Channel Production Setup

1. **Create `.env` file**:
```bash
# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=123456789

# PagerDuty
PAGERDUTY_ROUTING_KEY=your-routing-key

# Custom webhook
CUSTOM_WEBHOOK_URL=https://your-api.com/alerts
CUSTOM_WEBHOOK_TOKEN=your-bearer-token
```

2. **Create config with environment variables**:
```typescript
const config = {
  enabled: true,
  severityThreshold: 'medium',
  notifyOnDrift: true,
  notifyOnMigration: true,
  notifyOnFailure: true,
  maskPHI: true,
  phiFields: ['patient', 'medical', 'diagnosis'],
  channels: [
    {
      type: 'slack',
      enabled: true,
      maskPHI: true,
      config: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL
      }
    },
    {
      type: 'telegram',
      enabled: true,
      maskPHI: true,
      config: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID
      }
    },
    {
      type: 'pagerduty',
      enabled: true,
      config: {
        routingKey: process.env.PAGERDUTY_ROUTING_KEY
      }
    },
    {
      type: 'webhook',
      enabled: true,
      maskPHI: true,
      config: {
        url: process.env.CUSTOM_WEBHOOK_URL,
        headers: {
          'Authorization': `Bearer ${process.env.CUSTOM_WEBHOOK_TOKEN}`
        }
      }
    }
  ]
};
```

3. **Initialize once and forget**:
```typescript
const alertManager = new EnhancedAlertManager(config);

// Now all events automatically send to all channels
// with PHI protection enabled!
```

---

## Usage Examples

### Example 1: Development Environment

```json
{
  "enabled": true,
  "severityThreshold": "low",
  "notifyOnDrift": true,
  "notifyOnMigration": true,
  "notifyOnFailure": true,
  "maskPHI": true,
  "channels": [
    {
      "type": "telegram",
      "enabled": true,
      "config": {
        "botToken": "YOUR_DEV_BOT_TOKEN",
        "chatId": "YOUR_PERSONAL_CHAT_ID"
      }
    },
    {
      "type": "log",
      "enabled": true,
      "config": {}
    }
  ]
}
```

### Example 2: Staging Environment

```json
{
  "enabled": true,
  "severityThreshold": "medium",
  "notifyOnDrift": true,
  "notifyOnMigration": false,
  "notifyOnFailure": true,
  "maskPHI": true,
  "channels": [
    {
      "type": "slack",
      "enabled": true,
      "config": {
        "webhookUrl": "https://hooks.slack.com/services/STAGING/WEBHOOK"
      }
    }
  ]
}
```

### Example 3: Production Environment

```json
{
  "enabled": true,
  "severityThreshold": "high",
  "notifyOnDrift": true,
  "notifyOnMigration": true,
  "notifyOnFailure": true,
  "maskPHI": true,
  "phiFields": ["patient", "medical", "health"],
  "channels": [
    {
      "type": "slack",
      "enabled": true,
      "maskPHI": true,
      "config": {
        "webhookUrl": "${SLACK_WEBHOOK_PROD}"
      }
    },
    {
      "type": "pagerduty",
      "enabled": true,
      "config": {
        "routingKey": "${PAGERDUTY_KEY}"
      }
    },
    {
      "type": "email",
      "enabled": true,
      "maskPHI": false,
      "config": {
        "recipients": ["hipaa-compliance@example.com"]
      }
    }
  ]
}
```

---

## Best Practices

### 1. Always Enable PHI Masking

```json
{
  "maskPHI": true
}
```

**Why**: Protects patient privacy and ensures HIPAA compliance.

### 2. Use Environment Variables

```typescript
config: {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID
}
```

**Why**: Never commit credentials to git.

### 3. Per-Channel PHI Control

```json
{
  "channels": [
    {
      "type": "slack",
      "maskPHI": true
    },
    {
      "type": "email",
      "maskPHI": false,
      "config": {
        "recipients": ["compliance-only@example.com"]
      }
    }
  ]
}
```

**Why**: Public channels get masked data, compliance team gets full data.

### 4. Set Appropriate Severity Thresholds

```json
{
  "severityThreshold": "high"
}
```

**Why**: Avoid alert fatigue in production.

### 5. Use Multiple Channels

```json
{
  "channels": [
    {"type": "telegram", "enabled": true},
    {"type": "slack", "enabled": true},
    {"type": "pagerduty", "enabled": true}
  ]
}
```

**Why**: Redundancy ensures critical alerts are received.

### 6. Test Your Configuration

```typescript
// Send test alert
await alertManager.sendAlert({
  id: 'test-123',
  type: 'migration_completed',
  severity: 'low',
  message: 'Test alert - please ignore',
  details: { test: true },
  timestamp: new Date(),
  acknowledged: false
});
```

### 7. Monitor Alert History

```typescript
// Get recent alerts
const recent = alertManager.getHistory(10);

// Get unacknowledged
const unacked = alertManager.getUnacknowledged();
```

### 8. Add Custom PHI Fields

```json
{
  "phiFields": [
    "patient_number",
    "medical_id",
    "lab_test_result",
    "prescription_details"
  ]
}
```

**Why**: Your schema may have domain-specific PHI fields.

---

## Security Considerations

### ✅ DO

- ✅ Enable `maskPHI: true` globally
- ✅ Use environment variables for credentials
- ✅ Rotate webhook URLs/tokens regularly
- ✅ Test PHI masking before production
- ✅ Audit alert history for compliance
- ✅ Use HTTPS for all webhook URLs
- ✅ Implement rate limiting on alert channels

### ❌ DON'T

- ❌ Commit credentials to git
- ❌ Disable PHI masking in production
- ❌ Share webhook URLs publicly
- ❌ Send PHI to public channels
- ❌ Use unencrypted HTTP webhooks
- ❌ Ignore failed alert deliveries

---

## Troubleshooting

### Telegram Not Receiving Messages

**Check**:
1. Bot token is correct
2. Chat ID is correct (use `/getUpdates` API)
3. You've started a chat with the bot
4. Bot has permission to send messages

### Slack Webhook Failing

**Check**:
1. Webhook URL is valid and not expired
2. Slack workspace hasn't revoked the integration
3. Channel still exists
4. Check Slack API response for errors

### PHI Still Visible in Alerts

**Check**:
1. `maskPHI: true` is set globally
2. Custom PHI fields are added to `phiFields`
3. Field names match PHI patterns
4. Per-channel `maskPHI` isn't overriding

### No Alerts Being Sent

**Check**:
1. `enabled: true` globally
2. Alert severity meets threshold
3. Event type notifications are enabled
4. At least one channel is enabled
5. Check logs for errors

---

## Additional Resources

- **[Example Configurations](../examples/alert-config-examples.json)**: Ready-to-use configs
- **[API Documentation](./API.md)**: REST API reference
- **[HIPAA Compliance Guide](./OBSERVABILITY.md)**: Compliance details

---

**Made with 🔒 for HIPAA Compliance**
