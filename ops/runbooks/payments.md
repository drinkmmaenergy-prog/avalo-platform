# Payments Runbook

## Overview

This runbook covers payment processing issues, wallet failures, and transaction problems in the Avalo platform.

## Common Issues

### 1. Payment Processing Failures

**Symptoms:**
- Users unable to complete purchases
- Payment intent creation failures
- Transaction timeout errors

**Diagnosis:**
```bash
# Check recent payment errors
gcloud logging read "resource.type=cloud_function AND textPayload=~'payment.*error'" --limit=50

# Check Stripe API status
curl https://status.stripe.com/api/v2/status.json

# Check payment success rate
./scripts/check-payment-metrics.sh
```

**Resolution:**

1. **Stripe API Issues:**
   ```bash
   # Verify Stripe credentials
   firebase functions:config:get | grep stripe
   
   # Check Stripe webhook status
   stripe webhooks list --limit 10
   
   # Resend failed webhook events
   stripe events resend evt_xxx
   ```

2. **Database Connection:**
   ```bash
   # Check Firestore health
   firebase firestore:operations list
   
   # Verify transaction locks
   ./scripts/check-transaction-locks.sh
   ```

3. **Rate Limiting:**
   ```bash
   # Check rate limit status
   gcloud logging read "textPayload=~'rate limit exceeded'" --limit=20
   
   # Increase rate limits if needed
   firebase functions:config:set stripe.rate_limit=1000
   firebase deploy --only functions:payments
   ```

**Prevention:**
- Monitor payment success rate (target: >99%)
- Set up idempotency keys for all requests
- Implement circuit breakers
- Use request retries with exponential backoff

### 2. Wallet Balance Discrepancies

**Symptoms:**
- User wallet shows incorrect balance
- Missing transactions
- Duplicate charges

**Diagnosis:**
```bash
# Check user wallet document
firebase firestore:get wallets/{userId}

# Get transaction history
firebase firestore:query transactions \
  --where userId=='{userId}' \
  --order-by createdAt desc \
  --limit 50

# Compare with Stripe records
stripe balance_transactions list --limit=100 \
  --customer={stripeCustomerId}
```

**Resolution:**

1. **Balance Sync:**
   ```bash
   # Run balance reconciliation
   node scripts/reconcile-wallet.js --userId={userId}
   
   # Force balance recalculation
   firebase functions:call recalculateWalletBalance \
     --data='{"userId":"{userId}"}'
   ```

2. **Missing Transactions:**
   ```bash
   # Import missing transactions from Stripe
   node scripts/import-transactions.js \
     --userId={userId} \
     --startDate=2024-01-01
   
   # Verify import
   firebase firestore:count transactions \
     --where userId=='{userId}'
   ```

3. **Duplicate Transactions:**
   ```bash
   # Find duplicates
   node scripts/find-duplicate-transactions.js --userId={userId}
   
   # Remove duplicates (with confirmation)
   node scripts/remove-duplicate-transactions.js \
     --userId={userId} \
     --transactionId={txId} \
     --confirm
   ```

**Prevention:**
- Use transaction IDs for deduplication
- Implement atomic database operations
- Daily balance reconciliation job
- Transaction audit log

### 3. Withdrawal Delays

**Symptoms:**
- Withdrawals stuck in "pending" status
- Users not receiving payouts
- Failed bank transfers

**Diagnosis:**
```bash
# Check pending withdrawals
firebase firestore:query transactions \
  --where type==withdrawal \
  --where status==pending \
  --order-by createdAt

# Check payout status in Stripe
stripe payouts list --limit=20

# Verify bank account details
stripe customers retrieve {customerId} \
  --expand default_source
```

**Resolution:**

1. **Process Stuck Withdrawals:**
   ```bash
   # Retry withdrawal
   node scripts/retry-withdrawal.js --transactionId={txId}
   
   # Update withdrawal status
   firebase firestore:update transactions/{txId} \
     --data '{"status":"processing"}'
   
   # Force payout
   stripe payouts create --amount={amount} \
     --currency=usd \
     --destination={bankAccountId}
   ```

2. **Failed Payouts:**
   ```bash
   # Check failure reason
   stripe payout retrieve {payoutId}
   
   # Update bank account
   node scripts/update-bank-account.js \
     --userId={userId} \
     --accountNumber={new_account}
   
   # Retry payout
   stripe payouts create --amount={amount} \
     --destination={new_bankAccountId}
   ```

**Prevention:**
- Verify bank account before first payout
- Daily payout processing job
- Alert on pending > 24 hours
- Grace period for account updates

### 4. Refund Processing

**Symptoms:**
- Refund requests not processing
- Incorrect refund amounts
- Failed refund transactions

**Diagnosis:**
```bash
# Check refund request
firebase firestore:get refundRequests/{requestId}

# Verify original transaction
firebase firestore:get transactions/{originalTxId}

# Check Stripe refund status
stripe refunds retrieve {refundId}
```

**Resolution:**

1. **Process Refund:**
   ```bash
   # Create refund
   stripe refunds create \
     --payment-intent={paymentIntentId} \
     --amount={amountInCents}
   
   # Update refund request status
   firebase firestore:update refundRequests/{requestId} \
     --data '{"status":"approved","refundId":"{refundId}"}'
   
   # Create refund transaction
   node scripts/create-refund-transaction.js \
     --userId={userId} \
     --amount={amount} \
     --originalTxId={originalTxId}
   ```

2. **Partial Refunds:**
   ```bash
   # Calculate refund amount
   node scripts/calculate-refund.js \
     --transactionId={txId} \
     --refundPercentage=50
   
   # Process partial refund
   stripe refunds create \
     --payment-intent={paymentIntentId} \
     --amount={partialAmount}
   ```

**Prevention:**
- Clear refund policy
- Automated refund approval for small amounts
- Manual review for large refunds
- Refund analytics dashboard

## Escalation

### Level 1: On-Call Engineer
- Payment processing issues
- Wallet sync problems
- Common errors

### Level 2: Backend Lead
- Complex transaction issues
- Database inconsistencies
- Integration problems

### Level 3: CTO + Finance Team
- Major payment outages
- Security incidents
- Compliance issues
- Large-scale refunds

## Monitoring

### Key Metrics
- Payment success rate: >99%
- Average transaction time: <3s
- Failed transactions: <1%
- Withdrawal processing time: <24h

### Alerts
- Payment failures >1% for 5min
- Wallet sync failures >10/hour
- Withdrawal delays >24h
- Refund processing >1hour

## Contact Information

- **Stripe Support**: https://support.stripe.com
- **On-Call Engineer**: PagerDuty auto-escalation
- **Finance Team**: finance@avalo.app
- **Backend Team**: backend@avalo.app

## Additional Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Payment Flow Diagram](../docs/payment-flow.md)
- [Database Schema](../docs/AVALO_DATA_MODEL.md)
- [Compliance Guidelines](../docs/compliance.md)