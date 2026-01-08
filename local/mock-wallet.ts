/**
 * Mock Wallet Service for Local Development
 * Simulates wallet operations without real transactions
 */

const express = require('express');
const app = express();
app.use(express.json());

const config = {
  port: parseInt(process.env.MOCK_WALLET_PORT || '7003'),
  initialBalance: parseInt(process.env.MOCK_WALLET_INITIAL_BALANCE || '100'),
};

// In-memory wallet storage
const wallets = new Map();

// Get wallet
app.get('/wallet/:userId', (req, res) => {
  const { userId } = req.params;
  
  if (!wallets.has(userId)) {
    wallets.set(userId, {
      userId,
      balance: config.initialBalance,
      currency: 'USD',
      transactions: [],
    });
  }

  res.json(wallets.get(userId));
});

// Add funds
app.post('/wallet/:userId/add', (req, res) => {
  const { userId } = req.params;
  const { amount } = req.body;

  const wallet = wallets.get(userId) || {
    userId,
    balance: 0,
    currency: 'USD',
    transactions: [],
  };

  wallet.balance += amount;
  wallet.transactions.push({
    id: `tx_${Date.now()}`,
    type: 'deposit',
    amount,
    timestamp: new Date().toISOString(),
  });

  wallets.set(userId, wallet);
  res.json(wallet);
});

// Deduct funds
app.post('/wallet/:userId/deduct', (req, res) => {
  const { userId } = req.params;
  const { amount } = req.body;

  const wallet = wallets.get(userId);
  
  if (!wallet) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  if (wallet.balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  wallet.balance -= amount;
  wallet.transactions.push({
    id: `tx_${Date.now()}`,
    type: 'debit',
    amount,
    timestamp: new Date().toISOString(),
  });

  wallets.set(userId, wallet);
  res.json(wallet);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mock-wallet', port: config.port });
});

app.listen(config.port, () => {
  console.log(`💰 Mock Wallet Service running on port ${config.port}`);
  console.log(`   Initial Balance: $${config.initialBalance}`);
});