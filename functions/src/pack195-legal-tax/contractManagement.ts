/**
 * PACK 195: Contract Management Functions
 * Safe, professional contract generation and signing with anti-exploitation
 */

import { db, serverTimestamp, generateId } from '../init';
import {
  Contract,
  ContractType,
  ContractStatus,
  ContractParty,
  ContractTerms,
  AntiExploitationCheck,
  ContractDispute,
} from './types';

export async function generateContract(data: {
  creatorId: string;
  type: ContractType;
  creator: ContractParty;
  counterparty: ContractParty;
  terms: ContractTerms;
  templateId?: string;
}): Promise<{ contractId: string; contract: Contract }> {
  const contractId = generateId();

  const exploitationCheck = await runAntiExploitationChecks({
    type: data.type,
    terms: data.terms,
  });

  if (!exploitationCheck.passed) {
    throw new Error(
      `Contract blocked: ${exploitationCheck.blockers.join(', ')}`
    );
  }

  const reviewPeriodEndsAt = new Date();
  reviewPeriodEndsAt.setHours(reviewPeriodEndsAt.getHours() + 72);

  const contract: Contract = {
    id: contractId,
    type: data.type,
    status: 'draft',
    creatorId: data.creatorId,
    creator: data.creator,
    counterparty: data.counterparty,
    terms: data.terms,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    reviewPeriodEndsAt,
    antiExploitationChecks: {
      passed: exploitationCheck.passed,
      warnings: exploitationCheck.warnings,
      blockers: exploitationCheck.blockers,
      checkedAt: new Date(),
    },
    ...(data.terms.endDate && { expiresAt: data.terms.endDate }),
  };

  await db.collection('contracts').doc(contractId).set({
    ...contract,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    antiExploitationChecks: {
      ...contract.antiExploitationChecks,
      checkedAt: serverTimestamp(),
    },
  });

  return { contractId, contract };
}

export async function runAntiExploitationChecks(data: {
  type: ContractType;
  terms: ContractTerms;
}): Promise<AntiExploitationCheck> {
  const checks = {
    excessiveSplit: false,
    forcedExclusivity: false,
    lifetimeExclusivity: false,
    romanticClauses: false,
    modelingEscortRed: false,
    insufficientReviewTime: false,
  };

  const warnings: string[] = [];
  const blockers: string[] = [];

  const descriptionLower = data.terms.description.toLowerCase();
  const scopeText = data.terms.scope.join(' ').toLowerCase();

  if (data.terms.paymentAmount && data.terms.paymentAmount > 0) {
    const creatorShare = 100;
    if (creatorShare < 50) {
      checks.excessiveSplit = true;
      blockers.push('Revenue split gives creator less than 50%');
    }
  }

  if (data.terms.exclusivity?.enabled) {
    const duration = data.terms.exclusivity.duration || 0;

    if (duration > 365) {
      checks.lifetimeExclusivity = true;
      blockers.push('Exclusivity period exceeds 1 year');
    }

    if (duration > 180) {
      warnings.push('Exclusivity period is longer than 6 months');
    }

    if (
      data.terms.exclusivity.scope?.toLowerCase().includes('all') ||
      data.terms.exclusivity.scope?.toLowerCase().includes('lifetime')
    ) {
      checks.forcedExclusivity = true;
      blockers.push('Exclusivity scope is too broad');
    }
  }

  const romanticKeywords = [
    'relationship',
    'romantic',
    'dating',
    'loyalty',
    'fidelity',
    'attention',
    'emotional availability',
    'personal time',
  ];

  for (const keyword of romanticKeywords) {
    if (
      descriptionLower.includes(keyword) ||
      scopeText.includes(keyword)
    ) {
      checks.romanticClauses = true;
      blockers.push(
        `Contract contains romantic/personal clauses: "${keyword}"`
      );
    }
  }

  const escortKeywords = [
    'escort',
    'companion service',
    'adult entertainment',
    'intimate',
    'private meetings',
    'overnight',
  ];

  if (data.type === 'model_release') {
    for (const keyword of escortKeywords) {
      if (
        descriptionLower.includes(keyword) ||
        scopeText.includes(keyword)
      ) {
        checks.modelingEscortRed = true;
        blockers.push(
          `Modeling contract contains inappropriate terms: "${keyword}"`
        );
      }
    }
  }

  const passed = blockers.length === 0;

  return {
    contractId: '',
    checks,
    warnings,
    blockers,
    passed,
    checkedAt: new Date(),
  };
}

export async function signContract(data: {
  contractId: string;
  userId: string;
  ipAddress: string;
}): Promise<{ success: boolean }> {
  const contractRef = db.collection('contracts').doc(data.contractId);
  const contractSnap = await contractRef.get();

  if (!contractSnap.exists) {
    throw new Error('Contract not found');
  }

  const contract = contractSnap.data() as Contract;

  if (contract.status !== 'pending_signature' && contract.status !== 'draft') {
    throw new Error(`Cannot sign contract in status: ${contract.status}`);
  }

  const isCreator = contract.creatorId === data.userId;
  const isCounterparty = contract.counterparty.userId === data.userId;

  if (!isCreator && !isCounterparty) {
    throw new Error('User is not a party to this contract');
  }

  const now = new Date();
  const updateData: any = {
    updatedAt: serverTimestamp(),
  };

  if (isCreator) {
    updateData['creator.signedAt'] = serverTimestamp();
    updateData['creator.ipAddress'] = data.ipAddress;
  } else {
    updateData['counterparty.signedAt'] = serverTimestamp();
    updateData['counterparty.ipAddress'] = data.ipAddress;
  }

  const bothSigned =
    (isCreator && contract.counterparty.signedAt) ||
    (isCounterparty && contract.creator.signedAt);

  if (bothSigned) {
    updateData.status = 'active';
    updateData.signedAt = serverTimestamp();
  } else {
    updateData.status = 'pending_signature';
  }

  await contractRef.update(updateData);

  return { success: true };
}

export async function getContractById(
  contractId: string
): Promise<Contract | null> {
  const snap = await db.collection('contracts').doc(contractId).get();

  if (!snap.exists) {
    return null;
  }

  return snap.data() as Contract;
}

export async function getCreatorContracts(data: {
  creatorId: string;
  status?: ContractStatus;
  limit?: number;
}): Promise<Contract[]> {
  let query = db
    .collection('contracts')
    .where('creatorId', '==', data.creatorId)
    .orderBy('createdAt', 'desc');

  if (data.status) {
    query = query.where('status', '==', data.status) as any;
  }

  if (data.limit) {
    query = query.limit(data.limit) as any;
  }

  const snap = await query.get();
  return snap.docs.map((doc) => doc.data() as Contract);
}

export async function cancelContract(data: {
  contractId: string;
  userId: string;
  reason: string;
}): Promise<{ success: boolean }> {
  const contractRef = db.collection('contracts').doc(data.contractId);
  const contractSnap = await contractRef.get();

  if (!contractSnap.exists) {
    throw new Error('Contract not found');
  }

  const contract = contractSnap.data() as Contract;

  if (
    contract.creatorId !== data.userId &&
    contract.counterparty.userId !== data.userId
  ) {
    throw new Error('User is not a party to this contract');
  }

  if (contract.status === 'signed' || contract.status === 'active') {
    throw new Error('Cannot cancel a signed contract without dispute resolution');
  }

  await contractRef.update({
    status: 'cancelled',
    updatedAt: serverTimestamp(),
    'metadata.cancellationReason': data.reason,
    'metadata.cancelledBy': data.userId,
    'metadata.cancelledAt': serverTimestamp(),
  });

  return { success: true };
}

export async function raiseContractDispute(data: {
  contractId: string;
  raisedBy: string;
  reason: string;
  description: string;
  evidence: string[];
}): Promise<{ disputeId: string }> {
  const contractRef = db.collection('contracts').doc(data.contractId);
  const contractSnap = await contractRef.get();

  if (!contractSnap.exists) {
    throw new Error('Contract not found');
  }

  const contract = contractSnap.data() as Contract;

  if (
    contract.creatorId !== data.raisedBy &&
    contract.counterparty.userId !== data.raisedBy
  ) {
    throw new Error('User is not a party to this contract');
  }

  const against =
    contract.creatorId === data.raisedBy
      ? contract.counterparty.userId
      : contract.creatorId;

  const disputeId = generateId();

  const dispute: ContractDispute = {
    id: disputeId,
    contractId: data.contractId,
    raisedBy: data.raisedBy,
    against,
    reason: data.reason,
    description: data.description,
    evidence: data.evidence,
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('contract_disputes').doc(disputeId).set({
    ...dispute,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await contractRef.update({
    status: 'disputed',
    updatedAt: serverTimestamp(),
    'metadata.disputeId': disputeId,
  });

  return { disputeId };
}

export async function updateContractTerms(data: {
  contractId: string;
  userId: string;
  terms: Partial<ContractTerms>;
}): Promise<{ success: boolean }> {
  const contractRef = db.collection('contracts').doc(data.contractId);
  const contractSnap = await contractRef.get();

  if (!contractSnap.exists) {
    throw new Error('Contract not found');
  }

  const contract = contractSnap.data() as Contract;

  if (contract.creatorId !== data.userId) {
    throw new Error('Only the creator can update contract terms');
  }

  if (contract.status !== 'draft') {
    throw new Error('Can only update draft contracts');
  }

  const updatedTerms = {
    ...contract.terms,
    ...data.terms,
  };

  const exploitationCheck = await runAntiExploitationChecks({
    type: contract.type,
    terms: updatedTerms,
  });

  if (!exploitationCheck.passed) {
    throw new Error(
      `Updated terms blocked: ${exploitationCheck.blockers.join(', ')}`
    );
  }

  await contractRef.update({
    terms: updatedTerms,
    version: contract.version + 1,
    updatedAt: serverTimestamp(),
    antiExploitationChecks: {
      passed: exploitationCheck.passed,
      warnings: exploitationCheck.warnings,
      blockers: exploitationCheck.blockers,
      checkedAt: serverTimestamp(),
    },
  });

  return { success: true };
}