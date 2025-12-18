#!/usr/bin/env ts-node

/**
 * Test script to simulate a Paystack webhook
 * This helps verify your webhook endpoint is working correctly
 */

import * as crypto from 'crypto';
import axios from 'axios';

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';

if (!PAYSTACK_SECRET_KEY) {
  console.error('❌ PAYSTACK_SECRET_KEY environment variable is required');
  console.log(
    'Usage: PAYSTACK_SECRET_KEY=your_key ts-node scripts/test-webhook.ts'
  );
  process.exit(1);
}

// Sample webhook payload
const webhookPayload = {
  event: 'charge.success',
  data: {
    reference: `SUB_test_${Date.now()}`,
    amount: 200000, // 2000 NGN in kobo
    currency: 'NGN',
    status: 'success',
    paid_at: new Date().toISOString(),
    channel: 'bank_transfer',
    customer: {
      email: 'test@example.com',
    },
  },
};

/**
 * Generate Paystack signature
 */
function generateSignature(payload: any): string {
  const payloadString = JSON.stringify(payload);
  return crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(payloadString)
    .digest('hex');
}

/**
 * Send test webhook
 */
async function sendTestWebhook() {
  console.log(
    '🚀 Sending test webhook to:',
    `${BACKEND_URL}/subscription/webhook`
  );
  console.log('📦 Payload:', JSON.stringify(webhookPayload, null, 2));

  const signature = generateSignature(webhookPayload);
  console.log('🔐 Generated signature:', signature.substring(0, 20) + '...');

  try {
    const response = await axios.post(
      `${BACKEND_URL}/subscription/webhook`,
      webhookPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': signature,
        },
      }
    );

    console.log('✅ Webhook sent successfully!');
    console.log('📥 Response:', response.data);
    console.log('📊 Status:', response.status);
  } catch (error: any) {
    console.error('❌ Failed to send webhook');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

// Run the test
console.log('🧪 Paystack Webhook Test Script');
console.log('================================\n');

sendTestWebhook()
  .then(() => {
    console.log('\n✨ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  });
