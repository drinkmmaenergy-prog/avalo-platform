/**
 * PHASE 31 - Decentralized Wallet Integration
 *
 * ERC-20 ↔ in-app token conversion
 * WalletConnect integration for crypto payments
 * Testnet escrow contracts
 *
 * Feature flag: crypto_wallet_enabled
 * Region: europe-west3
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
;
;
;
;

const db = getFirestore();

/**
 * Supported blockchains
 */
export enum Blockchain {
  ETHEREUM = "ethereum",
  POLYGON = "polygon",
  BINANCE_SMART_CHAIN = "bsc",
}

/**
 * Conversion rate: 1 USDC = 100 in-app tokens
 */
const CONVERSION_RATE = 100;

/**
 * Connect wallet
 */
export const connectWalletV1 = onCall(
  { region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Check feature flag
    const enabled = await getFeatureFlag(uid, "crypto_wallet_enabled", false);
    if (!enabled) {
      throw new HttpsError("failed-precondition", "Crypto wallet not enabled");
    }

    // Validate input
    const schema = z.object({
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      blockchain: z.enum(["ethereum", "polygon", "bsc"]),
      signedMessage: z.string(),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { walletAddress, blockchain, signedMessage } = validationResult.data;

    try {
      // Cryptographic signature verification
      const message = `Avalo Wallet Connection - User ID: ${uid} - Timestamp: ${Date.now()}`;

      let recoveredAddress: string;
      try {
        recoveredAddress = ethers.verifyMessage(message, signedMessage);
      } catch (verifyError: any) {
        logger.error("Signature verification failed:", verifyError);
        throw new HttpsError("permission-denied", "Invalid signature");
      }

      // Verify recovered address matches provided wallet address
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        logger.warn(`Wallet address mismatch: provided ${walletAddress}, recovered ${recoveredAddress}`);
        throw new HttpsError(
          "permission-denied",
          "Signature does not match wallet address. Proof of ownership failed."
        );
      }

      logger.info(`Signature verified successfully for wallet ${walletAddress}`);

      // Store wallet connection
      await db.collection("users").doc(uid).update({
        [`wallets.${blockchain}`]: {
          address: walletAddress,
          connectedAt: Timestamp.now(),
          verified: true,
        },
      });

      logger.info(`Wallet connected: ${uid} -> ${walletAddress} (${blockchain})`);

      return {
        success: true,
        walletAddress,
        blockchain,
      };
    } catch (error: any) {
      logger.error("Failed to connect wallet:", error);
      throw new HttpsError("internal", "Failed to connect wallet");
    }
  }
);

/**
 * Initiate crypto deposit (convert crypto to in-app tokens)
 */
export const initiateDepositV1 = onCall(
  { region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Validate input
    const schema = z.object({
      blockchain: z.enum(["ethereum", "polygon", "bsc"]),
      amountUSDC: z.number().min(10).max(10000), // Min $10, Max $10,000
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { blockchain, amountUSDC } = validationResult.data;

    try {
      const depositId = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const tokensToCredit = amountUSDC * CONVERSION_RATE;

      // Get escrow contract address
      const escrowAddress = getEscrowAddress(blockchain as any);

      // Create pending deposit
      await db.collection("cryptoDeposits").doc(depositId).set({
        depositId,
        userId: uid,
        blockchain,
        amountUSDC,
        tokensToCredit,
        escrowAddress,
        status: "pending",
        createdAt: Timestamp.now(),
      });

      logger.info(`Deposit initiated: ${depositId} for ${uid}`);

      return {
        depositId,
        escrowAddress,
        amountUSDC,
        tokensToCredit,
        expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000), // 30 min
      };
    } catch (error: any) {
      logger.error("Failed to initiate deposit:", error);
      throw new HttpsError("internal", "Failed to initiate deposit");
    }
  }
);

/**
 * Confirm crypto deposit (called after on-chain transaction)
 */
export const confirmDepositV1 = onCall(
  { region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Validate input
    const schema = z.object({
      depositId: z.string(),
      txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { depositId, txHash } = validationResult.data;

    try {
      const depositRef = db.collection("cryptoDeposits").doc(depositId);
      const depositDoc = await depositRef.get();

      if (!depositDoc.exists) {
        throw new HttpsError("not-found", "Deposit not found");
      }

      const deposit = depositDoc.data();

      if (deposit?.userId !== uid) {
        throw new HttpsError("permission-denied", "Not your deposit");
      }

      if (deposit?.status !== "pending") {
        throw new HttpsError("failed-precondition", "Deposit already processed");
      }

      // On-chain transaction verification
      logger.info(`Verifying on-chain transaction: ${txHash} for deposit ${depositId}`);

      const provider = getBlockchainProvider(deposit.blockchain as Blockchain);

      let receipt;
      try {
        receipt = await provider.getTransactionReceipt(txHash);
      } catch (providerError: any) {
        logger.error("Failed to fetch transaction receipt:", providerError);
        throw new HttpsError(
          "unavailable",
          "Unable to verify transaction on blockchain. Please try again later."
        );
      }

      if (!receipt) {
        throw new HttpsError("not-found", "Transaction not found on blockchain");
      }

      // Verify transaction was successful
      if (receipt.status !== 1) {
        throw new HttpsError(
          "failed-precondition",
          "Transaction failed on blockchain. Deposit cannot be processed."
        );
      }

      // Get user's connected wallet for this blockchain
      const userDoc = await db.collection("users").doc(uid).get();
      const userWalletAddress = userDoc.data()?.wallets?.[deposit.blockchain]?.address;

      if (!userWalletAddress) {
        throw new HttpsError(
          "failed-precondition",
          "No wallet connected for this blockchain"
        );
      }

      // Verify sender wallet matches user's connected wallet
      if (receipt.from.toLowerCase() !== userWalletAddress.toLowerCase()) {
        logger.warn(
          `Wallet mismatch: tx from ${receipt.from}, user wallet ${userWalletAddress}`
        );
        throw new HttpsError(
          "permission-denied",
          "Transaction sender does not match your connected wallet"
        );
      }

      // Verify recipient is the escrow address
      if (receipt.to?.toLowerCase() !== deposit.escrowAddress.toLowerCase()) {
        logger.warn(
          `Escrow mismatch: tx to ${receipt.to}, expected ${deposit.escrowAddress}`
        );
        throw new HttpsError(
          "invalid-argument",
          "Transaction recipient does not match escrow address"
        );
      }

      logger.info(`On-chain verification successful for ${txHash}`);

      // Credit tokens
      await db.runTransaction(async (transaction) => {
        const userRef = db.collection("users").doc(uid);
        transaction.update(userRef, {
          tokens: (depositDoc.data()?.tokens || 0) + deposit.tokensToCredit,
        });

        transaction.update(depositRef, {
          status: "completed",
          txHash,
          completedAt: Timestamp.now(),
        });

        // Create transaction record
        transaction.set(db.collection("transactions").doc(), {
          type: "crypto_deposit",
          userId: uid,
          depositId,
          amount: deposit.tokensToCredit,
          sourceBlockchain: deposit.blockchain,
          txHash,
          createdAt: Timestamp.now(),
        });
      });

      logger.info(`Deposit confirmed: ${depositId}, txHash: ${txHash}`);

      return {
        success: true,
        tokensCredit: deposit.tokensToCredit,
        newBalance: (depositDoc.data()?.tokens || 0) + deposit.tokensToCredit,
      };
    } catch (error: any) {
      logger.error("Failed to confirm deposit:", error);
      throw new HttpsError("internal", "Failed to confirm deposit");
    }
  }
);

/**
 * Initiate withdrawal (convert in-app tokens to crypto)
 */
export const initiateWithdrawalV1 = onCall(
  { region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // Validate input
    const schema = z.object({
      blockchain: z.enum(["ethereum", "polygon", "bsc"]),
      amountTokens: z.number().min(1000).max(1000000), // Min 1000 tokens ($10)
    });

    const validationResult = schema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError("invalid-argument", validationResult.error.message);
    }

    const { blockchain, amountTokens } = validationResult.data;

    try {
      // Check user balance
      const userDoc = await db.collection("users").doc(uid).get();
      const userTokens = userDoc.data()?.tokens || 0;

      if (userTokens < amountTokens) {
        throw new HttpsError("failed-precondition", "Insufficient tokens");
      }

      // Check wallet connected
      const walletAddress = userDoc.data()?.wallets?.[blockchain]?.address;
      if (!walletAddress) {
        throw new HttpsError("failed-precondition", "Wallet not connected");
      }

      const withdrawalId = `wth_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const amountUSDC = amountTokens / CONVERSION_RATE;

      // Create pending withdrawal
      await db.collection("cryptoWithdrawals").doc(withdrawalId).set({
        withdrawalId,
        userId: uid,
        blockchain,
        amountTokens,
        amountUSDC,
        walletAddress,
        status: "pending",
        createdAt: Timestamp.now(),
      });

      // Deduct tokens immediately
      await db.collection("users").doc(uid).update({
        tokens: userTokens - amountTokens,
      });

      logger.info(`Withdrawal initiated: ${withdrawalId} for ${uid}`);

      return {
        withdrawalId,
        amountUSDC,
        walletAddress,
        estimatedTime: "2-24 hours",
      };
    } catch (error: any) {
      logger.error("Failed to initiate withdrawal:", error);
      throw new HttpsError("internal", "Failed to initiate withdrawal");
    }
  }
);

/**
 * Get blockchain provider for verification
 */
function getBlockchainProvider(blockchain: Blockchain): ethers.JsonRpcProvider {
  const providers = {
    ethereum: new ethers.JsonRpcProvider(
      process.env.ETHEREUM_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY"
    ),
    polygon: new ethers.JsonRpcProvider(
      process.env.POLYGON_RPC_URL || "https://polygon-mumbai.infura.io/v3/YOUR_KEY"
    ),
    bsc: new ethers.JsonRpcProvider(
      process.env.BSC_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545"
    ),
  };

  return providers[blockchain];
}

/**
 * Get escrow contract address for blockchain
 */
function getEscrowAddress(blockchain: Blockchain): string {
  // Testnet addresses - These should be configured via environment variables
  const addresses = {
    ethereum: process.env.ETHEREUM_ESCROW_ADDRESS || "0x0000000000000000000000000000000000000000",
    polygon: process.env.POLYGON_ESCROW_ADDRESS || "0x0000000000000000000000000000000000000000",
    bsc: process.env.BSC_ESCROW_ADDRESS || "0x0000000000000000000000000000000000000000",
  };

  return addresses[blockchain] || "";
}

/**
 * Get wallet connection status
 */
export const getWalletStatusV1 = onCall(
  { region: "europe-west3" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    try {
      const userDoc = await db.collection("users").doc(uid).get();
      const wallets = userDoc.data()?.wallets || {};

      return {
        connectedWallets: wallets,
        conversionRate: CONVERSION_RATE,
      };
    } catch (error: any) {
      logger.error("Failed to get wallet status:", error);
      throw new HttpsError("internal", "Failed to get status");
    }
  }
);


